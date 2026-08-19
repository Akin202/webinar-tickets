-- ============================================================================
-- BUG-1: a late payment could oversell the hall.
--
-- create_pending_order sweeps pending orders older than 30 minutes to
-- 'abandoned' and, by doing so, RELEASES the capacity those orders were
-- holding — the held count is `non-void tickets + sum(quantity) of PENDING
-- orders`, so an abandoned order stops counting and its seats go back on sale.
--
-- mark_order_paid, however, accepted `status in ('pending','abandoned',
-- 'failed')` and minted with no capacity re-check. So:
--
--   1. Buyer starts a bank transfer for 2 seats. Order is pending; 2 held.
--   2. 30+ minutes pass (bank transfers are slow in Nigeria). The next
--      checkout sweeps the order to 'abandoned'. The 2 seats are resold.
--   3. The transfer lands. Paystack fires charge.success. mark_order_paid
--      flips abandoned -> paid and mints 2 more tickets.
--   4. The hall is now oversold by 2, silently, and nobody finds out until
--      two people with valid QR codes are standing outside a full room.
--
-- The fix has to hold two truths at once: the money is real (so the order
-- MUST be marked paid — refusing to record a payment we actually took is
-- worse than any oversell), and the seat may genuinely be gone. So when the
-- claimed row's prior status was 'abandoned' or 'failed' — the only two
-- states whose capacity hold was released — we re-count capacity under the
-- same FOR UPDATE lock create_pending_order uses, and if the hall is full we
-- mark the order paid, mint ZERO tickets, write an audit row, and return a
-- new outcome 'paid_no_capacity'. The API routes log that at error level.
--
-- With the 10% capacity buffer this branch should never fire. It exists so
-- that if it ever does, it is loud and refundable rather than silent and
-- oversold.
--
-- Also here (same transaction, same review):
--   * record_check_in clamps a client-supplied p_scanned_at to now(). The
--     offline queue sends a device clock, and a device clock is user input.
-- ============================================================================

-- --------------------------------------------------------- mark order paid ----
-- Lock ordering note: create_pending_order takes `event_settings FOR UPDATE`
-- first and only then touches `orders`. This function does the same, so the
-- two can never deadlock against each other.
--
-- The lock is taken LATE on purpose. A webhook replay for an already-paid
-- order — by far the most common call — returns from the fast path above
-- without ever contending for the settings row. Only a call that is actually
-- going to settle money serializes against checkout.
create or replace function public.mark_order_paid(
  p_reference   text,
  p_amount_kobo integer,
  p_channel     text default null,
  p_raw         jsonb default null
)
returns table (outcome text, order_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    public.orders%rowtype;
  v_settings public.event_settings%rowtype;
  v_prior    public.order_status;
  v_held     integer;
  v_code     text;
  i          integer;
begin
  -- ---- fast paths: answerable without taking the capacity lock -------------
  select * into v_order from public.orders o where o.reference = p_reference;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if v_order.status = 'paid' then
    return query select 'already_paid'::text, v_order.id;
    return;
  end if;

  if v_order.total_kobo <> p_amount_kobo then
    return query select 'amount_mismatch'::text, v_order.id;
    return;
  end if;

  -- ---- serialize with create_pending_order --------------------------------
  -- Its stale-pending sweep is what releases capacity, so classifying the
  -- prior status without this lock is a race: the row could be swept from
  -- 'pending' to 'abandoned' between our read and our claim, and we would
  -- skip the capacity re-check for an order whose seats had just been resold.
  select * into v_settings from public.event_settings where id for update;

  -- Re-read under the lock. Another confirmer may have settled it meanwhile.
  select * into v_order from public.orders o where o.reference = p_reference;
  if v_order.status = 'paid' then
    return query select 'already_paid'::text, v_order.id;
    return;
  end if;

  v_prior := v_order.status;

  -- The atomic claim: only a pending/abandoned/failed order flips. A
  -- concurrent webhook replay loses here and reports already_paid.
  update public.orders o
     set status           = 'paid',
         paid_at          = now(),
         paystack_channel = coalesce(p_channel, o.paystack_channel),
         raw_webhook      = coalesce(p_raw, o.raw_webhook)
   where o.id = v_order.id
     and o.status in ('pending', 'abandoned', 'failed')
  returning * into v_order;

  if not found then
    -- Lost a race with another confirmer; re-read for the truthful answer.
    select * into v_order from public.orders o where o.reference = p_reference;
    return query select
      case when v_order.status = 'paid' then 'already_paid' else 'conflict' end::text,
      v_order.id;
    return;
  end if;

  -- ---- capacity guard -----------------------------------------------------
  -- 'pending' orders still hold their seats in the count below, so a
  -- pending -> paid flip needs no re-check: the order simply converts its own
  -- hold into tickets. 'abandoned' and 'failed' released theirs, so those are
  -- the only two priors that can oversell.
  if v_prior in ('abandoned', 'failed') then
    -- Same count create_pending_order uses. This order is now 'paid' with
    -- zero tickets, so it appears in neither term — no double counting.
    select coalesce((select count(*) from public.tickets t where t.status <> 'void'), 0)
         + coalesce((select sum(o.quantity) from public.orders o where o.status = 'pending'), 0)
      into v_held;

    if v_held + v_order.quantity > v_settings.capacity then
      -- The money is real and now recorded. The seat is gone. Mint nothing
      -- and make it impossible to miss: an audit row here, an error-level log
      -- in the webhook and verify routes, and an order visible in /admin as
      -- paid with zero tickets. Resolve by refund, by hand.
      insert into public.settings_audit (actor_id, field, old_value, new_value)
      values (
        null,
        'paid_no_capacity',
        p_reference,
        format(
          'prior=%s quantity=%s held=%s capacity=%s total_kobo=%s — PAID BUT NOT MINTED, REFUND REQUIRED',
          v_prior, v_order.quantity, v_held, v_settings.capacity, v_order.total_kobo
        )
      );

      return query select 'paid_no_capacity'::text, v_order.id;
      return;
    end if;
  end if;

  -- ---- mint ---------------------------------------------------------------
  -- holder_name/holder_phone denormalised from the buyer: the scanner caches
  -- tickets and never sees an order. Retry loop absorbs the astronomically
  -- unlikely code collision (31^8 space, unique index).
  for i in 1..v_order.quantity loop
    loop
      v_code := private.generate_ticket_code();
      begin
        insert into public.tickets (order_id, code, holder_name, holder_phone)
        values (v_order.id, v_code, v_order.buyer_name, v_order.buyer_phone);
        exit;
      exception when unique_violation then
        -- collision: generate again
      end;
    end loop;
  end loop;

  return query select 'paid'::text, v_order.id;
end;
$$;

-- create or replace preserves the ACL, but re-assert it so this migration is
-- self-describing: neither money function is reachable from a browser.
revoke execute on function public.mark_order_paid(text, integer, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.create_pending_order(text, text, text, text, integer, integer, integer, integer, integer)
  from public, anon, authenticated;

-- ------------------------------------------------ public surface: check-in ----
-- Unchanged except for the p_scanned_at clamp. The offline queue replays
-- check-ins with the timestamp the DOOR PHONE recorded, and a phone clock is
-- user input: a wrong (or tampered) clock could stamp an admission in 2031
-- and poison the audit log's ordering, which is the evidence staff rely on
-- when challenging a duplicate. least() ignores NULLs, so an explicit null
-- still resolves to now().
create or replace function public.record_check_in(
  p_code       text,
  p_device     text default null,
  p_scanned_at timestamptz default now()
)
returns table (
  result            public.check_in_result,
  ticket_id         uuid,
  code              text,
  holder_name       text,
  holder_phone      text,
  first_scanned_at  timestamptz,
  first_scanned_by  text,
  admitted_count    integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff    uuid := (select auth.uid());
  v_role     public.staff_role := private.current_staff_role();
  v_ticket   public.tickets%rowtype;
  v_result   public.check_in_result;
  v_first_by text;
  v_at       timestamptz := least(coalesce(p_scanned_at, now()), now());
begin
  if v_role is null or v_role not in ('door','admin') then
    raise exception 'not authorised to record check-ins' using errcode = '42501';
  end if;

  -- The atomic claim. Only a paid order's valid ticket can be admitted.
  update public.tickets t
     set status            = 'checked_in',
         checked_in_at     = v_at,
         checked_in_by     = v_staff,
         checked_in_device = p_device
    from public.orders o
   where t.code = p_code
     and t.status = 'valid'
     and o.id = t.order_id
     and o.status = 'paid'
  returning t.* into v_ticket;

  if found then
    v_result := 'admitted';
  else
    -- Lost the race, or never eligible. Classify by re-reading.
    select t.* into v_ticket from public.tickets t where t.code = p_code;

    if not found then
      v_result := 'not_found';
    elsif v_ticket.status = 'void' then
      v_result := 'voided';
    elsif v_ticket.status = 'checked_in' then
      v_result := 'already_used';
    else
      v_result := 'unpaid';   -- ticket exists, its order is not paid
    end if;
  end if;

  insert into public.check_ins (ticket_id, scanned_code, result, staff_id, device_id, scanned_at, synced_at)
  values (v_ticket.id, p_code, v_result, v_staff, p_device, v_at, now());

  if v_result = 'already_used' then
    select s.name into v_first_by
      from public.staff_users s where s.id = v_ticket.checked_in_by;
  end if;

  return query select
    v_result,
    v_ticket.id,
    coalesce(v_ticket.code, p_code),
    v_ticket.holder_name,
    v_ticket.holder_phone,
    case when v_result = 'already_used' then v_ticket.checked_in_at end,
    v_first_by,
    (select count(*)::integer from public.tickets t where t.status = 'checked_in');
end;
$$;

revoke execute on function public.record_check_in(text, text, timestamptz) from public, anon;
grant  execute on function public.record_check_in(text, text, timestamptz) to authenticated;
