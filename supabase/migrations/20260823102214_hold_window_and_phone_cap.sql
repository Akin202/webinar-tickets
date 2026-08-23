-- Anti-spam pass, written while sales are live and a Twitter video is driving
-- traffic. Three changes, all aimed at one number: how many seats can be held
-- by people who have not paid.
--
-- At the time of writing: capacity 300, 23 paid, and 114 seats held by 26
-- unpaid checkouts. Conversion is about 10%, so the overwhelming majority of
-- holds never become sales — they just make the hall look full to the buyers
-- who would have paid.
--
--   a) hold window 30 minutes -> 10 minutes
--   b) a cap on how many seats one phone may hold unpaid at once
--   c) sales_hard_stop corrected; the live row was a day early
--
-- (a) and (b) are the real guarantees. The API-layer rate limits added in the
-- same commit are per-instance memory that fails open on a cold start, and
-- Vercel runs several instances under a spike — they trim abuse, they do not
-- bound it. Only the database can, because only the database is one thing.


-- 1 ----------------------------------------------------------------------
-- create_pending_order, with a shorter hold and a per-phone ceiling.
--
-- WINDOW: 30 minutes was chosen before this thing had any traffic. A Paystack
-- checkout is a card and an OTP — about two minutes. Ten is already generous,
-- and it releases an abandoned basket three times faster.
--
-- A slow bank transfer can still overrun it. That case is already handled and
-- is not a lost sale: mark_order_paid accepts 'abandoned' as a flippable prior
-- status and re-checks capacity, so a late genuine payment settles anyway.
--
-- PHONE CAP: previously one phone could start 3 orders x 5 tickets and sit on
-- 15 seats, with nothing verifying the number. Twenty invented numbers could
-- show "sold out" to the entire audience for free. The cap counts PENDING
-- rows only — someone who has already paid for five and wants five more is a
-- good customer, not an attacker.
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
  v_settings   public.event_settings%rowtype;
  v_held       integer;
  v_phone_held integer;
  v_order_id   uuid;
begin
  -- Serialize all checkouts on the single settings row.
  select * into v_settings from public.event_settings where id for update;

  -- Sweep stale reservations before counting. Must stay in lockstep with the
  -- same interval in get_public_counter below, or the advertised count drifts
  -- from what this function will actually allow.
  update public.orders
     set status = 'abandoned'
   where status = 'pending'
     and created_at < now() - interval '10 minutes';

  if not v_settings.sales_open
     or (v_settings.sales_hard_stop is not null and now() > v_settings.sales_hard_stop) then
    return query select null::uuid, 'sales_closed'::text;
    return;
  end if;

  -- 5 == eventConfig.ticketing.maxPerOrder. Pinned against the config by
  -- tests/integration.test.ts so the two cannot drift apart silently.
  select coalesce(sum(o.quantity), 0)
    into v_phone_held
    from public.orders o
   where o.buyer_phone = p_buyer_phone
     and o.status = 'pending';

  if v_phone_held + p_quantity > 5 then
    return query select null::uuid, 'phone_limit'::text;
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

-- CREATE OR REPLACE keeps existing privileges, but this one is service-role
-- only and that matters far too much to leave implicit.
revoke execute on function public.create_pending_order(text, text, text, text, integer, integer, integer, integer, integer)
  from public, anon, authenticated;


-- 2 ----------------------------------------------------------------------
-- get_public_counter, matching the new window. Unchanged in every other
-- respect: still the only anon-reachable surface, still aggregates only.
create or replace function public.get_public_counter()
returns table (
  capacity            integer,
  tickets_sold        integer,
  tickets_remaining   integer,
  tickets_checked_in  integer,
  is_sold_out         boolean,
  sales_closed        boolean,
  last_updated_at     timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    es.capacity,
    sold.n,
    greatest(0, es.capacity - sold.n - held.n),
    (select count(*)::integer from public.tickets t where t.status = 'checked_in'),
    (sold.n + held.n) >= es.capacity,
    (not es.sales_open)
      or (es.sales_hard_stop is not null and now() > es.sales_hard_stop),
    now()
  from public.event_settings es
  cross join lateral (
    select count(*)::integer as n
    from public.tickets t
    where t.status <> 'void'
  ) sold
  cross join lateral (
    -- 10 minutes, matching the sweep in create_pending_order. This function is
    -- STABLE and cannot sweep, so it filters by age instead.
    select coalesce(sum(o.quantity), 0)::integer as n
    from public.orders o
    where o.status = 'pending'
      and o.created_at >= now() - interval '10 minutes'
  ) held
  where es.id;
$$;

revoke execute on function public.get_public_counter() from public;
grant  execute on function public.get_public_counter() to anon, authenticated;


-- 3 ----------------------------------------------------------------------
-- The live row said 2026-08-26T03:00Z — 04:00 WAT on the MORNING OF THE PARTY.
-- It was seeded in 20260818233714_initial_schema.sql, whose own comment says it
-- must track config/event.config.ts. The config moved to the 27th when the
-- event date changed; this row did not, and this row is the one that is
-- enforced. Left alone, checkout would have started refusing everybody about
-- nineteen hours before doors opened with most of the hall unsold.
--
-- Guarded so re-running is a no-op, and audited because a change to when
-- revenue stops is exactly the kind of thing someone asks about later.
do $$
declare
  v_old    timestamptz;
  v_target constant timestamptz := timestamptz '2026-08-27T04:00:00+01:00';
begin
  select sales_hard_stop into v_old from public.event_settings where id;

  if v_old is distinct from v_target then
    update public.event_settings
       set sales_hard_stop = v_target,
           updated_at      = now()
     where id;

    -- actor_id null: this is a migration, not a person clicking in /admin.
    insert into public.settings_audit (actor_id, field, old_value, new_value)
    values (null, 'sales_hard_stop', v_old::text, v_target::text);
  end if;
end $$;
