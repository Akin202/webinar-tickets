-- Two independent correctness fixes to functions that were already live.
--
-- 1. private.generate_ticket_code() drew from a 31-character alphabet with a
--    bare `% 31` over a 0-255 byte. 256 is not a multiple of 31, so the first
--    eight letters came up ~1.03x more often than the other twenty-three. The
--    TypeScript sibling (lib/api/reference.ts) documents avoiding exactly this
--    and uses rejection sampling; the SQL one did not. Not exploitable at 31^8
--    — the code space is not reachable over HTTP — but the two generators
--    disagreeing about a rule one of them spells out is how a real bias gets
--    introduced later by someone copying the wrong one.
--
-- 2. public.get_public_counter() reported remaining seats as
--    capacity - minted_tickets, while create_pending_order() gates on
--    minted_tickets + pending_holds. The public page could therefore advertise
--    seats that checkout would refuse to sell, which reads to a buyer as the
--    site being broken at the exact moment they are trying to pay us.
--
-- No schema change, no data migration. Both are CREATE OR REPLACE.


-- 1 ----------------------------------------------------------------------
-- Rejection sampling, mirroring lib/api/reference.ts. 248 is the largest
-- multiple of 31 that fits in a byte; anything at or above it is discarded
-- rather than folded, which is what makes the draw uniform.
--
-- 16 bytes per round to fill 8 slots: the expected acceptance rate is
-- 248/256, so one round almost always suffices and the loop is a formality.
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

  return 'SGN-' || substr(chars, 1, 4) || '-' || substr(chars, 5, 4);
end;
$$;

revoke execute on function private.generate_ticket_code() from public, anon, authenticated;


-- 2 ----------------------------------------------------------------------
-- tickets_sold keeps its old meaning — tickets actually minted — because it
-- is what the admin reconciles against Paystack, and calling a pending order
-- "sold" would be a lie. It is tickets_remaining and is_sold_out that must
-- agree with what checkout will actually do, so those two now subtract live
-- holds as well.
--
-- The 30-minute window matches the sweep in create_pending_order, which
-- abandons pending orders older than that before counting. Without the same
-- cutoff here, one buyer who closed the tab would permanently shrink the
-- advertised count. This function is STABLE and cannot do the sweep itself,
-- so it filters by age instead of relying on it having happened.
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
    select coalesce(sum(o.quantity), 0)::integer as n
    from public.orders o
    where o.status = 'pending'
      and o.created_at >= now() - interval '30 minutes'
  ) held
  where es.id;
$$;

-- Still the only anon-reachable surface in the database, and still counts
-- only — it now reads public.orders, but returns an aggregate and never a row.
revoke execute on function public.get_public_counter() from public;
grant  execute on function public.get_public_counter() to anon, authenticated;
