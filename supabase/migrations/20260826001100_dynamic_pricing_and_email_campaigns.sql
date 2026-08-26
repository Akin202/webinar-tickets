-- Dynamic price, marketing consent, and resumable campaign delivery.
-- All PII tables remain service-role only. The public price is exposed only
-- through the existing aggregate RPC.

alter table public.event_settings
  add column current_price_kobo integer not null default 300000
  constraint event_settings_price_range check (current_price_kobo between 100 and 100000000);

alter table public.orders
  add column marketing_opt_in boolean not null default false;

create type public.email_campaign_kind as enum ('essential', 'marketing');
create type public.email_campaign_audience as enum ('all_paid', 'checked_in', 'not_checked_in');
create type public.email_campaign_status as enum (
  'draft', 'sending', 'completed', 'completed_with_failures', 'failed'
);
create type public.email_recipient_status as enum ('pending', 'processing', 'sent', 'failed');

create table public.marketing_preferences (
  email             text primary key check (email = lower(btrim(email)) and email <> ''),
  consented_at      timestamptz,
  unsubscribed_at   timestamptz,
  updated_at        timestamptz not null default now(),
  constraint marketing_preference_state check (
    consented_at is not null or unsubscribed_at is not null
  )
);

create table public.email_campaigns (
  id                uuid primary key default gen_random_uuid(),
  kind              public.email_campaign_kind not null,
  audience          public.email_campaign_audience not null,
  subject           text not null check (char_length(subject) between 1 and 150),
  message           text not null check (char_length(message) between 1 and 10000),
  status            public.email_campaign_status not null default 'draft',
  targeted_count    integer not null default 0 check (targeted_count >= 0),
  sent_count        integer not null default 0 check (sent_count >= 0),
  failed_count      integer not null default 0 check (failed_count >= 0),
  created_by        uuid not null references public.staff_users(id) on delete restrict,
  created_at        timestamptz not null default now(),
  started_at        timestamptz,
  completed_at      timestamptz
);

create table public.email_campaign_recipients (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.email_campaigns(id) on delete cascade,
  email             text not null check (email = lower(btrim(email)) and email <> ''),
  buyer_name        text not null,
  status            public.email_recipient_status not null default 'pending',
  provider_id       text,
  error             text,
  attempt_count     integer not null default 0 check (attempt_count >= 0),
  sent_at           timestamptz,
  unique (campaign_id, email)
);

create index email_campaigns_created_at_idx on public.email_campaigns (created_at desc);
create index email_campaign_recipients_campaign_status_idx
  on public.email_campaign_recipients (campaign_id, status);

alter table public.marketing_preferences enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;
alter table public.marketing_preferences force row level security;
alter table public.email_campaigns force row level security;
alter table public.email_campaign_recipients force row level security;
revoke all on public.marketing_preferences from public, anon, authenticated;
revoke all on public.email_campaigns from public, anon, authenticated;
revoke all on public.email_campaign_recipients from public, anon, authenticated;

-- A paid order with a freshly checked box is an explicit re-consent. Orders
-- without the checkbox never alter an existing preference.
create or replace function private.activate_paid_marketing_consent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'paid'
     and old.status is distinct from 'paid'
     and new.marketing_opt_in then
    insert into public.marketing_preferences (email, consented_at, unsubscribed_at, updated_at)
    values (lower(btrim(new.buyer_email)), now(), null, now())
    on conflict (email) do update
      set consented_at = excluded.consented_at,
          unsubscribed_at = null,
          updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

create trigger orders_activate_marketing_consent
after update of status on public.orders
for each row execute function private.activate_paid_marketing_consent();

-- Admin-only atomic price update and audit.
create or replace function public.set_ticket_price(p_price_kobo integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := (select auth.uid());
  v_old integer;
begin
  if private.current_staff_role() is distinct from 'admin' then
    raise exception 'only an admin may change ticket price' using errcode = '42501';
  end if;
  if p_price_kobo < 100 or p_price_kobo > 100000000 then
    raise exception 'ticket price outside allowed range' using errcode = '22003';
  end if;

  select current_price_kobo into v_old
  from public.event_settings where id for update;

  if v_old is distinct from p_price_kobo then
    update public.event_settings
       set current_price_kobo = p_price_kobo, updated_at = now()
     where id;
    insert into public.settings_audit (actor_id, field, old_value, new_value)
    values (v_staff, 'current_price_kobo', v_old::text, p_price_kobo::text);
  end if;
  return p_price_kobo;
end;
$$;
revoke execute on function public.set_ticket_price(integer) from public, anon;
grant execute on function public.set_ticket_price(integer) to authenticated;

-- Replace checkout RPC: the row lock and price equality check make a stale
-- browser/server calculation retry instead of creating a mixed-price order.
drop function public.create_pending_order(text, text, text, text, integer, integer, integer, integer, integer);
create function public.create_pending_order(
  p_reference text, p_buyer_name text, p_buyer_email text, p_buyer_phone text,
  p_quantity integer, p_unit_price_kobo integer, p_service_charge_kobo integer,
  p_fee_kobo integer, p_total_kobo integer, p_marketing_opt_in boolean default false
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

  -- A complimentary ticket is priced at nothing on purpose, so it can never
  -- match current_price_kobo. Exempt it — but only when EVERY money column is
  -- zero, so a partially-zeroed call cannot buy its way past the check. Safe
  -- because this function is revoked from anon and authenticated: the only
  -- caller is our own service-role server, and /api/admin/comp is behind the
  -- admin guard.
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
    service_charge_kobo, fee_kobo, total_kobo, status, marketing_opt_in
  ) values (
    p_reference, p_buyer_name, lower(btrim(p_buyer_email)), p_buyer_phone, p_quantity,
    p_unit_price_kobo, p_service_charge_kobo, p_fee_kobo, p_total_kobo, 'pending',
    coalesce(p_marketing_opt_in, false)
  ) returning id into v_order_id;
  return query select v_order_id, 'created'::text;
end;
$$;
revoke execute on function public.create_pending_order(
  text, text, text, text, integer, integer, integer, integer, integer, boolean
) from public, anon, authenticated;

-- DROP, not CREATE OR REPLACE: this adds current_price_kobo to the returned
-- row, and Postgres refuses to change an existing function's return type in
-- place. Replacing it would abort the whole migration. The grants are
-- re-issued below, so the drop costs nothing.
drop function if exists public.get_public_counter();
create function public.get_public_counter()
returns table (
  capacity integer, tickets_sold integer, tickets_remaining integer,
  tickets_checked_in integer, is_sold_out boolean, sales_closed boolean,
  current_price_kobo integer, last_updated_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select es.capacity, sold.n, greatest(0, es.capacity - sold.n - held.n),
    (select count(*)::integer from public.tickets t where t.status = 'checked_in'),
    (sold.n + held.n) >= es.capacity,
    (not es.sales_open) or (es.sales_hard_stop is not null and now() > es.sales_hard_stop),
    es.current_price_kobo, now()
  from public.event_settings es
  cross join lateral (
    select count(*)::integer n from public.tickets t where t.status <> 'void'
  ) sold
  cross join lateral (
    select coalesce(sum(o.quantity), 0)::integer n from public.orders o
    where o.status = 'pending' and o.created_at >= now() - interval '10 minutes'
  ) held where es.id;
$$;
revoke execute on function public.get_public_counter() from public;
grant execute on function public.get_public_counter() to anon, authenticated;
