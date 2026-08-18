-- ============================================================================
-- The money path, made atomic.
--
-- supabase-js cannot express multi-statement transactions, and the two writes
-- that matter — reserving capacity and minting tickets on payment — must be
-- atomic or two concurrent buyers oversell the hall / a replayed webhook
-- double-mints. So both live here, in the database, as SECURITY DEFINER
-- functions callable ONLY by the service role (the API routes). Neither is
-- reachable from a browser: no grant to anon or authenticated, and PUBLIC is
-- revoked explicitly.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------- ticket code generation ----
-- Unambiguous alphabet (no 0/O/1/I/L), matching the CHECK constraint on
-- tickets.code. gen_random_bytes, not random(): codes are bearer credentials,
-- so they must be unpredictable, not merely unique.
create or replace function private.generate_ticket_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  chars    text := '';
  bytes    bytea;
  i        integer;
begin
  bytes := extensions.gen_random_bytes(8);
  for i in 0..7 loop
    chars := chars || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  end loop;
  return 'SGN-' || substr(chars, 1, 4) || '-' || substr(chars, 5, 4);
end;
$$;
revoke execute on function private.generate_ticket_code() from public, anon, authenticated;

-- --------------------------------------------------- create pending order ----
-- The capacity gate. FOR UPDATE on the event_settings row is the
-- serialization point: two concurrent checkouts queue here, so the
-- capacity check and the insert are effectively one operation.
--
-- Capacity counts non-void tickets PLUS the quantities of fresh pending
-- orders (younger than 30 minutes) — a buyer mid-payment holds their seats.
-- Stale pending orders are swept to 'abandoned' on the way in, so an
-- abandoned checkout releases its hold without needing a cron.
--
-- Money comes in pre-computed by the caller (the API route runs
-- computeOrderTotals, the single source of truth) and is re-validated by the
-- orders_money_band CHECK on insert.
create or replace function public.create_pending_order(
  p_reference           text,
  p_buyer_name          text,
  p_buyer_email         text,
  p_buyer_phone         text,
  p_quantity            integer,
  p_unit_price_kobo     integer,
  p_service_charge_kobo integer,
  p_fee_kobo            integer,
  p_total_kobo          integer
)
returns table (order_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.event_settings%rowtype;
  v_held     integer;
  v_order_id uuid;
begin
  -- Serialize all checkouts on the single settings row.
  select * into v_settings from public.event_settings where id for update;

  -- Sweep stale reservations before counting.
  update public.orders
     set status = 'abandoned'
   where status = 'pending'
     and created_at < now() - interval '30 minutes';

  if not v_settings.sales_open
     or (v_settings.sales_hard_stop is not null and now() > v_settings.sales_hard_stop) then
    return query select null::uuid, 'sales_closed'::text;
    return;
  end if;

  select coalesce((select count(*) from public.tickets t where t.status <> 'void'), 0)
       + coalesce((select sum(o.quantity) from public.orders o where o.status = 'pending'), 0)
    into v_held;

  if v_held + p_quantity > v_settings.capacity then
    return query select null::uuid, 'sold_out'::text;
    return;
  end if;

  insert into public.orders (
    reference, buyer_name, buyer_email, buyer_phone, quantity,
    unit_price_kobo, service_charge_kobo, fee_kobo, total_kobo, status
  ) values (
    p_reference, p_buyer_name, p_buyer_email, p_buyer_phone, p_quantity,
    p_unit_price_kobo, p_service_charge_kobo, p_fee_kobo, p_total_kobo, 'pending'
  )
  returning id into v_order_id;

  return query select v_order_id, 'created'::text;
end;
$$;
revoke execute on function public.create_pending_order(text, text, text, text, integer, integer, integer, integer, integer)
  from public, anon, authenticated;

-- --------------------------------------------------------- mark order paid ----
-- THE idempotent payment flip. Called by the Paystack webhook, and by the
-- order-status route as a fallback when it finds a pending order and asks
-- Paystack directly (webhooks can lag or be missed). Both paths converge
-- here, and the conditional UPDATE means whichever arrives second is a no-op:
-- 'pending' -> 'paid' happens exactly once, and tickets are minted exactly
-- once, in the same transaction.
--
-- Amount mismatch mints nothing and marks nothing — it returns a signal for
-- the caller to log loudly. We initialized the transaction with our own
-- server-computed amount, so a mismatch means tampering or a Paystack-side
-- anomaly, and minting entry passes on it would be the wrong default.
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
  v_order public.orders%rowtype;
  v_code  text;
  i       integer;
begin
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

  -- The atomic claim: only a pending order flips. A concurrent webhook
  -- replay loses here and reports already_paid on its own re-read.
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

  -- Mint. holder_name/holder_phone denormalised from the buyer: the scanner
  -- caches tickets and never sees an order. Retry loop absorbs the
  -- astronomically unlikely code collision (31^8 space, unique index).
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
revoke execute on function public.mark_order_paid(text, integer, text, jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------------ staff lookup ----
-- The one thing an authenticated staff client may ask about itself. Backs
-- getCurrentStaffUser() so the scanner can show who is signed in; role
-- enforcement everywhere else stays inside the SECURITY DEFINER functions.
create or replace function public.get_current_staff()
returns table (id uuid, name text, role public.staff_role)
language sql
security definer
set search_path = ''
stable
as $$
  select s.id, s.name, s.role
  from public.staff_users s
  where s.id = (select auth.uid());
$$;
revoke execute on function public.get_current_staff() from public, anon;
grant  execute on function public.get_current_staff() to authenticated;
