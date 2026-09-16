-- FlagIQ AI Summit '26 — the first migration that is not inherited from the
-- sign-out build. Applied to a FRESH project, after the seven sign-out
-- migrations, so there are no existing orders or tickets to backfill.
--
--   1. Ticket codes: SGN- -> FIQ-  (check constraint + generator, together)
--   2. attendee_type on orders, threaded through create_pending_order
--   3. event_settings seeded for this event: capacity, price, hard stop
--
-- tests/migration-invariants.test.ts pins every constant here against
-- types/ticketing.ts and config/event.config.ts.


-- 1 ----------------------------------------------------------------------
-- The constraint and the generator must change in the same migration, or the
-- first paid order mints a code its own table refuses and mark_order_paid
-- fails after Paystack has already taken the money.
alter table public.tickets drop constraint tickets_code_check;
alter table public.tickets add constraint tickets_code_check
  check (code ~ '^FIQ-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$');

-- Body identical to 20260819152618 (rejection sampling) apart from the prefix.
create or replace function private.generate_ticket_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text    := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  ceiling  constant integer := 248;
  chars    text := '';
  bytes    bytea;
  b        integer;
  i        integer;
begin
  while length(chars) < 8 loop
    bytes := extensions.gen_random_bytes(16);
    for i in 0..15 loop
      exit when length(chars) >= 8;
      b := get_byte(bytes, i);
      continue when b >= ceiling;
      chars := chars || substr(alphabet, (b % 31) + 1, 1);
    end loop;
  end loop;

  return 'FIQ-' || substr(chars, 1, 4) || '-' || substr(chars, 5, 4);
end;
$$;

revoke execute on function private.generate_ticket_code() from public, anon, authenticated;


-- 2 ----------------------------------------------------------------------
create type public.attendee_type as enum ('student', 'professional', 'founder');

-- Nullable at the column, required by the CHECK for anyone who pays. A
-- complimentary ticket is issued by an admin for a named guest and has no
-- buyer to ask; its all-zero money columns are what identify it already.
alter table public.orders add column attendee_type public.attendee_type;
alter table public.orders add constraint orders_paying_buyer_has_attendee_type
  check (attendee_type is not null or total_kobo = 0);

-- Body identical to 20260826001100 apart from p_attendee_type. DROP first:
-- adding a parameter changes the signature, so CREATE OR REPLACE would leave
-- the old 10-argument overload callable beside the new one.
drop function public.create_pending_order(
  text, text, text, text, integer, integer, integer, integer, integer, boolean
);
create function public.create_pending_order(
  p_reference text, p_buyer_name text, p_buyer_email text, p_buyer_phone text,
  p_quantity integer, p_unit_price_kobo integer, p_service_charge_kobo integer,
  p_fee_kobo integer, p_total_kobo integer, p_marketing_opt_in boolean default false,
  p_attendee_type public.attendee_type default null
)
returns table (order_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.event_settings%rowtype;
  v_held integer;
  v_phone_held integer;
  v_order_id uuid;
begin
  select * into v_settings from public.event_settings where id for update;

  -- Complimentary exemption: only when EVERY money column is zero.
  if not (p_unit_price_kobo = 0 and p_service_charge_kobo = 0
          and p_fee_kobo = 0 and p_total_kobo = 0)
     and p_unit_price_kobo is distinct from v_settings.current_price_kobo then
    return query select null::uuid, 'price_changed'::text;
    return;
  end if;

  update public.orders set status = 'abandoned'
   where status = 'pending' and created_at < now() - interval '10 minutes';
  if not v_settings.sales_open
     or (v_settings.sales_hard_stop is not null and now() > v_settings.sales_hard_stop) then
    return query select null::uuid, 'sales_closed'::text; return;
  end if;
  select coalesce(sum(o.quantity), 0) into v_phone_held
    from public.orders o where o.buyer_phone = p_buyer_phone and o.status = 'pending';
  if v_phone_held + p_quantity > 5 then
    return query select null::uuid, 'phone_limit'::text; return;
  end if;
  select coalesce((select count(*) from public.tickets t where t.status <> 'void'), 0)
       + coalesce((select sum(o.quantity) from public.orders o where o.status = 'pending'), 0)
    into v_held;
  if v_held + p_quantity > v_settings.capacity then
    return query select null::uuid, 'sold_out'::text; return;
  end if;
  insert into public.orders (
    reference, buyer_name, buyer_email, buyer_phone, quantity, unit_price_kobo,
    service_charge_kobo, fee_kobo, total_kobo, status, marketing_opt_in, attendee_type
  ) values (
    p_reference, p_buyer_name, lower(btrim(p_buyer_email)), p_buyer_phone, p_quantity,
    p_unit_price_kobo, p_service_charge_kobo, p_fee_kobo, p_total_kobo, 'pending',
    coalesce(p_marketing_opt_in, false), p_attendee_type
  ) returning id into v_order_id;
  return query select v_order_id, 'created'::text;
end;
$$;
revoke execute on function public.create_pending_order(
  text, text, text, text, integer, integer, integer, integer, integer, boolean, public.attendee_type
) from public, anon, authenticated;


-- 3 ----------------------------------------------------------------------
-- The inherited seed says 300 seats at N3,000 closing on 27 August. This row is
-- what checkout ENFORCES — config/event.config.ts only describes it — so it is
-- written here explicitly rather than trusted to have been edited by hand.
-- Guarded per field so a re-run is a no-op, and audited like the admin does.
do $$
declare
  v_row              public.event_settings%rowtype;
  v_capacity  constant integer     := 100;
  v_price     constant integer     := 1000000;
  v_hard_stop constant timestamptz := timestamptz '2026-10-02T23:59:00+01:00';
begin
  select * into v_row from public.event_settings where id for update;

  if v_row.capacity is distinct from v_capacity then
    update public.event_settings set capacity = v_capacity, updated_at = now() where id;
    insert into public.settings_audit (actor_id, field, old_value, new_value)
    values (null, 'capacity', v_row.capacity::text, v_capacity::text);
  end if;

  if v_row.current_price_kobo is distinct from v_price then
    update public.event_settings set current_price_kobo = v_price, updated_at = now() where id;
    insert into public.settings_audit (actor_id, field, old_value, new_value)
    values (null, 'current_price_kobo', v_row.current_price_kobo::text, v_price::text);
  end if;

  if v_row.sales_hard_stop is distinct from v_hard_stop then
    update public.event_settings set sales_hard_stop = v_hard_stop, updated_at = now() where id;
    insert into public.settings_audit (actor_id, field, old_value, new_value)
    values (null, 'sales_hard_stop', v_row.sales_hard_stop::text, v_hard_stop::text);
  end if;
end $$;
