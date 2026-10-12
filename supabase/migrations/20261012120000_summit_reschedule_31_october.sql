-- The Summit moves from Saturday 3 October to Saturday 31 October 2026, and is
-- renamed Flag Skool Summit (owner's call, 2026-10-12). The name lives in config;
-- this row is what checkout ENFORCES, so the hard stop moves here, explicitly.
-- Sales close the night before, as they did for 3 October.
--
-- Guarded so a re-run is a no-op, and audited like the admin does.
-- tests/migration-invariants.test.ts pins v_hard_stop to
-- config/event.config.ts ticketing.salesHardStopAt.
do $$
declare
  v_row       public.event_settings%rowtype;
  v_hard_stop constant timestamptz := timestamptz '2026-10-30T23:59:00+01:00';
begin
  select * into v_row from public.event_settings where id for update;

  if v_row.sales_hard_stop is distinct from v_hard_stop then
    update public.event_settings set sales_hard_stop = v_hard_stop, updated_at = now() where id;
    insert into public.settings_audit (actor_id, field, old_value, new_value)
    values (null, 'sales_hard_stop', v_row.sales_hard_stop::text, v_hard_stop::text);
  end if;
end $$;
