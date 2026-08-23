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
