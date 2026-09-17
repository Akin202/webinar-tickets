-- Free livestream registration, in its own table.
--
-- Deliberately NOT a row in public.orders. Capacity, the sales summary,
-- reconcile.mjs, the CSV export and every campaign audience all sum orders,
-- so a free sign-up living there would eat one of the 100 seats the moment a
-- single filter was forgotten. A separate table needs no filters anywhere.
--
-- No payment, no ticket, no QR: the only thing this row buys is an email with
-- the stream link, sent from /admin as a normal campaign the day before.

create table public.livestream_registrations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 2 and 120),
  -- Stored lower-cased and trimmed, like marketing_preferences.email, so the
  -- unique index below actually means "one person, one registration".
  email            text not null unique
                   check (email = lower(btrim(email)) and email <> ''),
  phone            text not null check (phone ~ '^\+234[0-9]{10}$'),
  attendee_type    public.attendee_type not null,
  marketing_opt_in boolean not null default false,
  created_at       timestamptz not null default now()
);

comment on table public.livestream_registrations is
  'Free livestream sign-ups. Never counts against seat capacity — see create_pending_order, which reads only public.orders.';

create index livestream_registrations_created_at_idx
  on public.livestream_registrations (created_at desc);

-- Same deny-by-default posture as every other table: service role only.
alter table public.livestream_registrations enable row level security;
alter table public.livestream_registrations force row level security;
revoke all on public.livestream_registrations from anon, authenticated;

-- Idempotent by design. A buyer who taps Register twice, or forgets they
-- already signed up, must see success — not a duplicate-key error. The
-- outcome tells the API which confirmation copy to send.
create function public.register_livestream(
  p_name             text,
  p_email            text,
  p_phone            text,
  p_attendee_type    public.attendee_type,
  p_marketing_opt_in boolean default false
)
returns table (outcome text, registration_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id    uuid;
begin
  select id into v_id
  from public.livestream_registrations
  where email = v_email;

  if v_id is not null then
    return query select 'already_registered'::text, v_id;
    return;
  end if;

  insert into public.livestream_registrations (name, email, phone, attendee_type, marketing_opt_in)
  values (btrim(p_name), v_email, p_phone, p_attendee_type, coalesce(p_marketing_opt_in, false))
  -- Closes the race between the select above and this insert: two concurrent
  -- submissions of the same address must not raise, and must not double-insert.
  on conflict (email) do update set email = excluded.email
  returning id into v_id;

  return query select 'registered'::text, v_id;
end;
$$;

-- Never callable from the browser. The API route holds the service role.
revoke execute on function public.register_livestream(text, text, text, public.attendee_type, boolean)
  from public, anon, authenticated;

-- Marketing consent for a livestream sign-up flows into the same preference
-- table the ticket buyers use, so one unsubscribe link covers both audiences.
create function private.sync_livestream_marketing_preference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.marketing_opt_in then
    insert into public.marketing_preferences (email, consented_at, unsubscribed_at, updated_at)
    values (new.email, now(), null, now())
    on conflict (email) do update
      set consented_at = excluded.consented_at,
          unsubscribed_at = null,
          updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

create trigger livestream_registrations_marketing_preference
  after insert on public.livestream_registrations
  for each row execute function private.sync_livestream_marketing_preference();

-- A campaign audience of its own: the stream link goes to these people and
-- to nobody who paid for a seat.
alter type public.email_campaign_audience add value 'livestream';
