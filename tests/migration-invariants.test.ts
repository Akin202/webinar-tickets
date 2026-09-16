import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { eventConfig, eventEndsIso } from '@/config/event.config';
import { ATTENDEE_TYPES, TICKET_CODE_PATTERN, TICKET_CODE_PREFIX } from '@/types/ticketing';

/**
 * Constants that exist in BOTH the config/contract and the SQL, pinned against
 * each other.
 *
 * The database is the enforcer — checkout reads event_settings and the guards
 * inside create_pending_order, not config/event.config.ts. So whenever a value
 * is duplicated into SQL, the config becomes documentation that can quietly
 * stop being true. On the build this was forked from, the hard stop in config
 * moved and the enforced row did not — it would have closed sales on the
 * morning of the event with most of the room unsold.
 *
 * These run offline against the migration text, so they guard intent at commit
 * time. tests/integration.test.ts checks the deployed row separately.
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

const intervalsIn = (text: string) =>
  [...text.matchAll(/interval '(\d+) minutes'/g)].map((m) => m[1]);

const sql = latestMigrationMatching('_hold_window_and_phone_cap.sql');

describe('hold window and phone cap migration', () => {
  it('uses one and the same hold window in both functions', () => {
    // create_pending_order sweeps by it; get_public_counter filters by it. If
    // they disagree the page advertises seats checkout will refuse, or hides
    // seats it would have sold.
    const intervals = intervalsIn(sql);
    expect(intervals.length).toBe(2);
    expect(new Set(intervals).size).toBe(1);
  });

  it('caps per-phone holds at exactly maxPerOrder', () => {
    const match = sql.match(/if v_phone_held \+ p_quantity > (\d+) then/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(eventConfig.ticketing.maxPerOrder);
  });
});

/**
 * The dynamic-pricing migration. These pin the two ways it could break the
 * money path.
 */
const pricingSql = latestMigrationMatching('_dynamic_pricing_and_email_campaigns.sql');

describe('dynamic pricing migration', () => {
  it('drops get_public_counter before recreating it', () => {
    // It gains a current_price_kobo output column, and Postgres refuses to
    // change an existing function's return type in place.
    const dropAt = pricingSql.indexOf('drop function if exists public.get_public_counter()');
    const createAt = pricingSql.indexOf('create function public.get_public_counter()');

    expect(dropAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(dropAt);
    expect(pricingSql).not.toContain('create or replace function public.get_public_counter()');
  });

  it('exempts zero-money comps from the price equality check', () => {
    expect(pricingSql).toContain('p_unit_price_kobo = 0');
    expect(pricingSql).toContain('p_service_charge_kobo = 0');
    expect(pricingSql).toContain('p_fee_kobo = 0');
    expect(pricingSql).toContain('p_total_kobo = 0');
  });

  it('requires every money column to be zero for that exemption', () => {
    const guard = pricingSql.match(
      /if not \(p_unit_price_kobo = 0[\s\S]*?\)\s*\n\s*and p_unit_price_kobo is distinct from/
    );
    expect(guard).not.toBeNull();
  });

  it('keeps the hold window identical in both functions it rewrites', () => {
    const intervals = intervalsIn(pricingSql);
    expect(intervals.length).toBe(2);
    expect(new Set(intervals).size).toBe(1);
  });
});

/**
 * The Summit migration: the latest definition of create_pending_order, the
 * ticket code shape, attendee type, and the enforced event_settings row.
 */
const summitSql = latestMigrationMatching('_summit_codes_attendee_type_and_settings.sql');

describe('summit migration', () => {
  it("sweeps holds by the same window get_public_counter still filters by", () => {
    // Only create_pending_order is redefined here; the counter it must agree
    // with is still the one from the pricing migration.
    const summitIntervals = intervalsIn(summitSql);
    expect(summitIntervals.length).toBe(1);
    expect(new Set([...summitIntervals, ...intervalsIn(pricingSql)]).size).toBe(1);
  });

  it('caps per-phone holds at exactly maxPerOrder', () => {
    const match = summitSql.match(/if v_phone_held \+ p_quantity > (\d+) then/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(eventConfig.ticketing.maxPerOrder);
  });

  it('keeps the all-zero comp exemption on the price check', () => {
    expect(
      summitSql.match(
        /if not \(p_unit_price_kobo = 0 and p_service_charge_kobo = 0\s*\n\s*and p_fee_kobo = 0 and p_total_kobo = 0\)\s*\n\s*and p_unit_price_kobo is distinct from/
      )
    ).not.toBeNull();
  });

  it('uses the contract ticket code prefix in the constraint AND the generator', () => {
    // Changing one without the other means the first paid order mints a code
    // its own table rejects — after Paystack has taken the money.
    expect(summitSql).toContain(
      `check (code ~ '^${TICKET_CODE_PREFIX}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$')`
    );
    expect(summitSql).toContain(`return '${TICKET_CODE_PREFIX}-' || substr(chars, 1, 4)`);
    expect(TICKET_CODE_PATTERN.source).toBe(`${TICKET_CODE_PREFIX}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}`);
  });

  it('declares exactly the attendee types the contract lists', () => {
    const match = summitSql.match(/create type public\.attendee_type as enum \(([^)]+)\)/);
    expect(match).not.toBeNull();
    const values = match![1].split(',').map((v) => v.trim().replace(/'/g, ''));
    expect(values).toEqual([...ATTENDEE_TYPES]);
    expect(eventConfig.attendeeTypes.map((t) => t.value)).toEqual([...ATTENDEE_TYPES]);
  });

  it('lets only a zero-money order skip attendee type', () => {
    expect(summitSql).toContain('check (attendee_type is not null or total_kobo = 0)');
  });

  it('seeds the capacity, price and hard stop the config advertises', () => {
    const capacity = summitSql.match(/v_capacity\s+constant integer\s+:= (\d+);/);
    const price = summitSql.match(/v_price\s+constant integer\s+:= (\d+);/);
    const hardStop = summitSql.match(/v_hard_stop constant timestamptz := timestamptz '([^']+)'/);

    expect(Number(capacity![1])).toBe(eventConfig.ticketing.capacity);
    expect(Number(price![1])).toBe(eventConfig.ticketing.priceKobo);
    expect(new Date(hardStop![1]).toISOString()).toBe(
      new Date(eventConfig.ticketing.salesHardStopAt).toISOString()
    );
  });

  it('stops sales no later than the event ends', () => {
    expect(new Date(eventConfig.ticketing.salesHardStopAt).getTime()).toBeLessThanOrEqual(
      new Date(eventEndsIso).getTime()
    );
  });
});
