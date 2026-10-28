-- Livestream promo code support:
-- Allows STREAM2SUMMIT promo code for livestream attendees at N3,000 (300,000 kobo),
-- capped strictly at 1 ticket per livestream email.

create or replace function public.create_pending_order(
  p_reference text, p_buyer_name text, p_buyer_email text, p_buyer_phone text,
  p_quantity integer, p_unit_price_kobo integer, p_service_charge_kobo integer,
  p_fee_kobo integer, p_total_kobo integer, p_marketing_opt_in boolean default false,
  p_attendee_type public.attendee_type default null,
  p_promo_code text default null
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
  v_is_promo boolean := false;
begin
  select * into v_settings from public.event_settings where id for update;

  -- Livestream promo validation:
  if upper(btrim(coalesce(p_promo_code, ''))) = 'STREAM2SUMMIT'
     and p_unit_price_kobo = 300000 and p_quantity = 1 then
    if exists (select 1 from public.livestream_registrations lr where lr.email = lower(btrim(p_buyer_email))) then
      if exists (select 1 from public.orders o where o.buyer_email = lower(btrim(p_buyer_email)) and o.status = 'paid' and o.unit_price_kobo = 300000) then
        return query select null::uuid, 'promo_already_used'::text;
        return;
      end if;
      v_is_promo := true;
    else
      return query select null::uuid, 'promo_ineligible'::text;
      return;
    end if;
  end if;

  -- Complimentary exemption OR promo exemption:
  if not (p_unit_price_kobo = 0 and p_service_charge_kobo = 0
          and p_fee_kobo = 0 and p_total_kobo = 0)
     and not v_is_promo
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
  text, text, text, text, integer, integer, integer, integer, integer, boolean, public.attendee_type, text
) from public, anon, authenticated;

