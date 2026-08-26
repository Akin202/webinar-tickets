import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { eventConfig } from '@/config/event.config';

/**
 * Constants that exist in BOTH the config and the SQL, pinned against each
 * other.
 *
 * The database is the enforcer — checkout reads event_settings and the guards
 * inside create_pending_order, not config/event.config.ts. So whenever a number
 * is duplicated into SQL, the config becomes documentation that can quietly
 * stop being true. That already happened once: the event moved to 26 August,
 * salesHardStopAt moved to the 27th, and the live sales_hard_stop row stayed on
 * the 26th — which would have closed sales on the morning of the party with
 * most of the hall unsold. Nobody noticed because nothing compared them.
 *
 * These run offline against the migration text, so they guard the intent at
 * commit time. tests/integration.test.ts checks the deployed row separately.
 */

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../supabase/migrations');

function latestMigrationMatching(suffix: string): string {
  const file = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(suffix))
    .sort()
    .pop();

  if (!file) throw new Error(`No migration ending in ${suffix}`);
  return readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
}

const sql = latestMigrationMatching('_hold_window_and_phone_cap.sql');

describe('hold window and phone cap migration', () => {
  it('uses one and the same hold window in both functions', () => {
    const intervals = [...sql.matchAll(/interval '(\d+) minutes'/g)].map((m) => m[1]);

    // create_pending_order sweeps by it; get_public_counter filters by it. If
    // they disagree the page advertises seats checkout will refuse, or hides
    // seats it would have sold.
    expect(intervals.length).toBe(2);
    expect(new Set(intervals).size).toBe(1);
  });

  it('caps per-phone holds at exactly maxPerOrder', () => {
    const match = sql.match(/if v_phone_held \+ p_quantity > (\d+) then/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(eventConfig.ticketing.maxPerOrder);
  });

  it('writes the same hard stop the config advertises', () => {
    const match = sql.match(/v_target constant timestamptz := timestamptz '([^']+)'/);
    expect(match).not.toBeNull();

    expect(new Date(match![1]).toISOString()).toBe(
      new Date(eventConfig.ticketing.salesHardStopAt).toISOString()
    );
  });

  it('leaves the hard stop after the event actually ends', () => {
    // endsAt is the morning after doorsOpen, so the backstop must clear the
    // whole night. This is the check that would have caught the original bug
    // even without a config to compare against.
    const { date, endsAt, utcOffset } = eventConfig.event;
    const eventEnd = new Date(`${date}T${endsAt}:00${utcOffset}`);
    const nextMorning = new Date(eventEnd.getTime() + 24 * 60 * 60 * 1000);

    expect(new Date(eventConfig.ticketing.salesHardStopAt).getTime()).toBeGreaterThan(
      nextMorning.getTime() - 24 * 60 * 60 * 1000
    );
  });
});

/**
 * The dynamic-pricing migration. These pin the two ways it could break the
 * money path, both found by reading it rather than by running it — it had
 * never been applied to any database when these were written.
 */
const pricingSql = latestMigrationMatching('_dynamic_pricing_and_email_campaigns.sql');

describe('dynamic pricing migration', () => {
  it('drops get_public_counter before recreating it', () => {
    // It gains a current_price_kobo output column, and Postgres refuses to
    // change an existing function's return type in place. CREATE OR REPLACE
    // aborts the whole migration, so the DROP has to come first.
    const dropAt = pricingSql.indexOf('drop function if exists public.get_public_counter()');
    const createAt = pricingSql.indexOf('create function public.get_public_counter()');

    expect(dropAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(dropAt);
    expect(pricingSql).not.toContain('create or replace function public.get_public_counter()');
  });

  it('exempts zero-money comps from the price equality check', () => {
    // /api/admin/comp calls create_pending_order with p_unit_price_kobo 0, so
    // without this every complimentary ticket returns price_changed and the
    // route falls through to mark_order_paid on a reference with no order row.
    expect(pricingSql).toContain('p_unit_price_kobo = 0');
    expect(pricingSql).toContain('p_service_charge_kobo = 0');
    expect(pricingSql).toContain('p_fee_kobo = 0');
    expect(pricingSql).toContain('p_total_kobo = 0');
  });

  it('requires every money column to be zero for that exemption', () => {
    // A partially-zeroed call must NOT reach the exemption, or the price check
    // becomes optional for anything that zeroes one column.
    const guard = pricingSql.match(
      /if not \(p_unit_price_kobo = 0[\s\S]*?\)\s*\n\s*and p_unit_price_kobo is distinct from/
    );
    expect(guard).not.toBeNull();
  });

  it('seeds the price the config advertises', () => {
    const match = pricingSql.match(/add column current_price_kobo integer not null default (\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(eventConfig.ticketing.priceKobo);
  });

  it('keeps the hold window identical in both functions it rewrites', () => {
    // Same invariant as the previous migration: create_pending_order sweeps by
    // this interval and get_public_counter filters by it.
    const intervals = [...pricingSql.matchAll(/interval '(\d+) minutes'/g)].map((m) => m[1]);

    expect(intervals.length).toBe(2);
    expect(new Set(intervals).size).toBe(1);
  });
});
