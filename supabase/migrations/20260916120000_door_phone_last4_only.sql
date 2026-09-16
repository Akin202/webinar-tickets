-- Door identity check is holder name + the LAST 4 digits of the phone.
--
-- Door devices cache the manifest in IndexedDB for offline scanning, so every
-- column the door RPCs return ends up on a phone that can be lost at a venue.
-- Until now both returned the full holder_phone. They now return only
-- holder_phone_last4, so a full number never leaves the database for a door
-- session. Admin screens read tickets through the service-role API and keep
-- the full number.
--
-- An OUT column cannot be renamed by CREATE OR REPLACE, so both functions are
-- dropped and recreated, and their grants re-applied exactly as before.

drop function if exists public.get_check_in_manifest();
drop function if exists public.record_check_in(text, text, timestamptz);

create function public.get_check_in_manifest()
returns table (
  id                 uuid,
  code               text,
  holder_name        text,
  holder_phone_last4 text,
  status             public.ticket_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.code, t.holder_name, right(t.holder_phone, 4), t.status
  from public.tickets t
  where private.current_staff_role() in ('door','admin');
$$;

create function public.record_check_in(
  p_code       text,
  p_device     text        default null,
  p_scanned_at timestamptz default now()
)
returns table (
  result             public.check_in_result,
  ticket_id          uuid,
  code               text,
  holder_name        text,
  holder_phone_last4 text,
  first_scanned_at   timestamptz,
  first_scanned_by   text,
  admitted_count     integer
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
    right(v_ticket.holder_phone, 4),
    case when v_result = 'already_used' then v_ticket.checked_in_at end,
    v_first_by,
    (select count(*)::integer from public.tickets t where t.status = 'checked_in');
end;
$$;

revoke execute on function public.get_check_in_manifest()                  from public, anon;
revoke execute on function public.record_check_in(text, text, timestamptz) from public, anon;
grant  execute on function public.get_check_in_manifest()                  to authenticated;
grant  execute on function public.record_check_in(text, text, timestamptz) to authenticated;
