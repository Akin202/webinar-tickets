-- ============================================================================
-- Sign-Out Tickets — initial schema
-- Mirrors /types/ticketing.ts. That file is the contract; this must match it.
--
-- Money is integer kobo everywhere. No numeric, no float, ever.
-- Capacity 300 x ~N3,376 = ~101,000,000 kobo, comfortably inside int4.
--
-- Default posture is DENY. Every table is revoked from anon and authenticated
-- with no policies; access exists only through the SECURITY DEFINER functions
-- at the bottom of this file. Admin lists, CSV export and /ticket/[reference]
-- are served server-side with the service-role key and need nothing here.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- ---------------------------------------------------------------- enums ----
create type public.order_status     as enum ('pending','paid','failed','abandoned','refunded');
create type public.ticket_status    as enum ('valid','checked_in','void');
create type public.check_in_result  as enum ('admitted','already_used','not_found','voided','unpaid');
create type public.staff_role       as enum ('admin','door');

-- --------------------------------------------------------------- tables ----
-- Single row. Values must match config/event.config.ts — capacity and the hard
-- stop are duplicated here deliberately so they are enforced by the database
-- and not only by a config file a client could ignore. If you change one,
-- change both in the same commit.
create table public.event_settings (
  id              boolean primary key default true constraint event_settings_single_row check (id),
  sales_open      boolean     not null default true,
  capacity        integer     not null check (capacity > 0),
  sales_hard_stop timestamptz,
  updated_at      timestamptz not null default now()
);
comment on column public.event_settings.sales_open is
  'PRIMARY sales gate, admin-controlled. No date-based auto-close.';
comment on column public.event_settings.sales_hard_stop is
  'BACKSTOP ONLY, never the primary gate. Stops sales for an event that already ended.';

create table public.staff_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text              not null,
  role       public.staff_role not null,
  created_at timestamptz       not null default now()
);
comment on table public.staff_users is
  'Authorisation source of truth. NEVER read role from JWT user_metadata — it is user-editable, so a door account could promote itself to admin and read every buyer phone number.';

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  reference           text        not null unique,
  buyer_name          text        not null,
  buyer_email         text        not null,
  buyer_phone         text        not null check (buyer_phone ~ '^\+234[0-9]{10}$'),
  -- Generous hard ceiling ONLY. The real per-order cap is maxPerOrder in
  -- config/event.config.ts, enforced at checkout so the buyer gets a friendly
  -- message. Do not tighten this to match config: raising maxPerOrder would
  -- then throw a raw constraint violation and 500 the checkout instead.
  quantity            integer     not null check (quantity between 1 and 10),
  unit_price_kobo     integer     not null check (unit_price_kobo >= 0),
  service_charge_kobo integer     not null check (service_charge_kobo >= 0),
  fee_kobo            integer     not null default 0 check (fee_kobo >= 0),
  total_kobo          integer     not null check (total_kobo >= 0),
  status              public.order_status not null default 'pending',
  paystack_channel    text,
  raw_webhook         jsonb,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  constraint orders_paid_has_timestamp check (status <> 'paid' or paid_at is not null),
  -- Money sanity band. Deliberately NOT the strict identity
  --     total_kobo - fee_kobo - service_charge_kobo = unit_price_kobo * quantity
  -- which holds only while passFeeToBuyer is true. That flag flipped false ->
  -- true on 2026-08-18, so a CHECK pinned to it would break every insert the
  -- next time someone toggles a config boolean. This band still makes it
  -- impossible to write an order that undercharges the organiser or charges
  -- the buyer more than base + service charge + gateway fee, and it holds
  -- under both modes and for zero-value complimentary rows.
  -- Do NOT add a fee_passed_to_buyer column to recover the mode: it is already
  -- derivable, so the column would be redundant rather than explicit.
  --     residual = total_kobo - (unit_price_kobo * quantity) - service_charge_kobo
  --     residual == fee_kobo  -> fee was passed to the buyer
  --     residual == 0         -> the organiser absorbed it
  -- Exact in both directions: grossUpForPaystackFee never overshoots, verified
  -- across 240 cases either side of the N2,500 flat-fee threshold, at the
  -- N2,000 cap and at rate 0. When fee_kobo is 0 the two modes are economically
  -- identical, so the ambiguity there is not a real one. Orders written either
  -- side of a mid-sale flip stay separable by arithmetic alone.
  constraint orders_money_band check (
    total_kobo >= unit_price_kobo * quantity
    and total_kobo <= unit_price_kobo * quantity + service_charge_kobo + fee_kobo
  )
);
comment on column public.orders.service_charge_kobo is
  'Retained platform fee. A SERVICE CHARGE, NOT VAT — retained, not remitted. Never rename this vat_kobo and never label it VAT on a receipt.';
comment on column public.orders.fee_kobo is
  'Paystack gateway cut. Deliberately separate from service_charge_kobo so reconciliation can tell the processor''s take from retained revenue.';

create table public.tickets (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete restrict,
  code              text not null unique check (code ~ '^SGN-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'),
  holder_name       text not null,
  holder_phone      text check (holder_phone ~ '^\+234[0-9]{10}$'),
  status            public.ticket_status not null default 'valid',
  issued_at         timestamptz not null default now(),
  checked_in_at     timestamptz,
  checked_in_by     uuid references public.staff_users(id),
  checked_in_device text,
  constraint tickets_checked_in_consistency
    check ((status = 'checked_in') = (checked_in_at is not null))
);
comment on column public.tickets.code is
  'Unambiguous alphabet — no 0/O/1/I/L. Generated server-side, non-sequential, non-enumerable.';
comment on column public.tickets.holder_phone is
  'The door''s identity check. Denormalised from the order deliberately: the scanner caches ticket rows in IndexedDB and never sees an order. NOT holder-editable.';

create table public.check_ins (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid references public.tickets(id) on delete set null,
  scanned_code text not null,
  result       public.check_in_result not null,
  staff_id     uuid references public.staff_users(id),
  device_id    text,
  scanned_at   timestamptz not null default now(),
  synced_at    timestamptz
);
comment on table public.check_ins is
  'Append-only audit log. No updates, no deletes — enforced by the absence of any UPDATE/DELETE policy and by no role holding those grants.';

-- Who closed sales, and when. Closing sales stops all revenue, so this gets asked.
create table public.settings_audit (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.staff_users(id),
  field      text        not null,
  old_value  text,
  new_value  text,
  changed_at timestamptz not null default now()
);

-- -------------------------------------------------------------- indexes ----
create index tickets_order_id_idx     on public.tickets (order_id);
create index tickets_status_idx       on public.tickets (status);
create index orders_status_idx        on public.orders (status);
create index orders_created_at_idx    on public.orders (created_at desc);
create index check_ins_ticket_id_idx  on public.check_ins (ticket_id);
create index check_ins_scanned_at_idx on public.check_ins (scanned_at desc);

-- ------------------------------------------------------------------ RLS ----
alter table public.event_settings enable row level security;
alter table public.staff_users    enable row level security;
alter table public.orders         enable row level security;
alter table public.tickets        enable row level security;
alter table public.check_ins      enable row level security;
alter table public.settings_audit enable row level security;

alter table public.event_settings force row level security;
alter table public.staff_users    force row level security;
alter table public.orders         force row level security;
alter table public.tickets        force row level security;
alter table public.check_ins      force row level security;
alter table public.settings_audit force row level security;

revoke all on public.event_settings from anon, authenticated;
revoke all on public.staff_users    from anon, authenticated;
revoke all on public.orders         from anon, authenticated;
revoke all on public.tickets        from anon, authenticated;
revoke all on public.check_ins      from anon, authenticated;
revoke all on public.settings_audit from anon, authenticated;

-- ------------------------------------------------------- private helpers ----
-- search_path = '' forces fully-qualified names. Without it, a caller-controlled
-- search_path can point a SECURITY DEFINER function at a different table.
create or replace function private.current_staff_role()
returns public.staff_role
language sql
security definer
set search_path = ''
stable
as $$
  select role from public.staff_users where id = (select auth.uid());
$$;
revoke execute on function private.current_staff_role() from public, anon, authenticated;

-- ------------------------------------------- public surface: anon counter ----
-- Counts only. No money, ever. This is the entire anon-reachable data surface,
-- and it is why the public page can render "312 going" without the anon key
-- being able to read a single row.
-- Mirrors PublicSalesCounter in types/ticketing.ts.
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
    greatest(0, es.capacity - sold.n),
    (select count(*)::integer from public.tickets t where t.status = 'checked_in'),
    sold.n >= es.capacity,
    (not es.sales_open)
      or (es.sales_hard_stop is not null and now() > es.sales_hard_stop),
    now()
  from public.event_settings es
  cross join lateral (
    select count(*)::integer as n from public.tickets t where t.status <> 'void'
  ) sold
  where es.id;
$$;
grant execute on function public.get_public_counter() to anon, authenticated;

-- ------------------------------------------- public surface: door manifest ----
-- The four columns the scanner needs and nothing else. No buyer email, no
-- order linkage, no revenue. holder_phone IS the identity check, which is why
-- it is here and why it is denormalised onto tickets.
create or replace function public.get_check_in_manifest()
returns table (
  id           uuid,
  code         text,
  holder_name  text,
  holder_phone text,
  status       public.ticket_status
)
language sql
security definer
set search_path = ''
stable
as $$
  select t.id, t.code, t.holder_name, t.holder_phone, t.status
  from public.tickets t
  where private.current_staff_role() in ('door','admin');
$$;
grant execute on function public.get_check_in_manifest() to authenticated;

-- ------------------------------------------------ public surface: check-in ----
-- THE highest-stakes function in the product.
--
-- First scan wins, decided by a single UPDATE whose WHERE clause carries the
-- precondition. There is no read-then-write window, so two door phones racing
-- on the same code produce exactly one admission. Re-running the same scan
-- (which the offline queue will do when it flushes duplicates) returns
-- already_used rather than admitting twice — that is what makes sync idempotent.
--
-- Every outcome writes an audit row, including not_found.
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
  v_staff  uuid := (select auth.uid());
  v_role   public.staff_role := private.current_staff_role();
  v_ticket public.tickets%rowtype;
  v_result public.check_in_result;
  v_first_by text;
begin
  if v_role is null or v_role not in ('door','admin') then
    raise exception 'not authorised to record check-ins' using errcode = '42501';
  end if;

  -- The atomic claim. Only a paid order's valid ticket can be admitted.
  update public.tickets t
     set status            = 'checked_in',
         checked_in_at     = p_scanned_at,
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
  values (v_ticket.id, p_code, v_result, v_staff, p_device, p_scanned_at, now());

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
grant execute on function public.record_check_in(text, text, timestamptz) to authenticated;

-- --------------------------------------------- public surface: sales gate ----
-- Until this exists the admin toggle is per-tab browser memory: closing sales
-- in /admin changes one variable in one tab while every other buyer keeps paying.
create or replace function public.set_sales_open(p_open boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := (select auth.uid());
  v_old   boolean;
begin
  if private.current_staff_role() is distinct from 'admin' then
    raise exception 'only an admin may open or close sales' using errcode = '42501';
  end if;

  select sales_open into v_old from public.event_settings where id;

  update public.event_settings
     set sales_open = p_open, updated_at = now()
   where id;

  insert into public.settings_audit (actor_id, field, old_value, new_value)
  values (v_staff, 'sales_open', v_old::text, p_open::text);

  return p_open;
end;
$$;
grant execute on function public.set_sales_open(boolean) to authenticated;

-- ------------------------------------------------------------- seed row ----
-- Must match config/event.config.ts: capacity 300, hard stop 2026-08-26T04:00+01.
insert into public.event_settings (id, sales_open, capacity, sales_hard_stop)
values (true, true, 300, '2026-08-26T04:00:00+01:00')
on conflict (id) do nothing;
