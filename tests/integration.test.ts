import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { eventConfig } from '@/config/event.config';

/**
 * Integration tests against the LIVE Supabase project.
 *
 * Gated behind INTEGRATION=1 because they write real rows. Everything they
 * create is namespaced with an INTEG- prefix and deleted in afterAll, but a
 * crashed run can still leave a row behind — that is the price of testing the
 * two properties that cannot be proved any other way:
 *
 *   1. Two door phones racing the same QR admit exactly one person.
 *   2. A late payment cannot mint a ticket past capacity.
 *
 * Both are concurrency properties of Postgres functions. A mock cannot
 * demonstrate either; only two genuinely concurrent statements against the
 * real row locks can.
 *
 *   INTEGRATION=1 DOOR_JWT=<token> npx vitest run tests/integration.test.ts
 *
 * DOOR_JWT comes from signing in as the door account:
 *   curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
 *     -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
 *     -d '{"email":"<door account>","password":"<gate PIN>"}'
 */

const ENABLED = process.env.INTEGRATION === '1';

function env(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        })
    );
  } catch {
    return {};
  }
}

const CONFIG = env();
const URL_BASE = CONFIG.NEXT_PUBLIC_SUPABASE_URL;
const ANON = CONFIG.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = CONFIG.SUPABASE_SERVICE_ROLE_KEY;
const DOOR_JWT = process.env.DOOR_JWT;

/** Everything this suite creates carries this prefix so cleanup is exact. */
const PREFIX = 'INTEG-';
const created: string[] = [];

async function rpc(fn: string, body: unknown, token = SERVICE) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, row: Array.isArray(json) ? json[0] : json };
}

async function table(path: string, init?: RequestInit) {
  return fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function createPaidOrder(reference: string) {
  created.push(reference);
  const create = await rpc('create_pending_order', {
    p_reference: reference,
    p_buyer_name: 'Integration Test',
    p_buyer_email: 'integration@invalid.local',
    p_buyer_phone: '+2348000000000',
    p_quantity: 1,
    p_unit_price_kobo: 0,
    p_service_charge_kobo: 0,
    p_fee_kobo: 0,
    p_total_kobo: 0,
  });
  const paid = await rpc('mark_order_paid', {
    p_reference: reference,
    p_amount_kobo: 0,
    p_channel: null,
    p_raw: { integration_test: true },
  });
  return { create: create.row, paid: paid.row };
}

async function ticketCodeFor(reference: string): Promise<string | null> {
  const res = await table(`tickets?select=code,orders!inner(reference)&orders.reference=eq.${reference}`);
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) && rows[0]?.code ? rows[0].code : null;
}

afterAll(async () => {
  if (!ENABLED) return;
  // Ordered by dependency: check-ins, then tickets, then the orders.
  for (const reference of created) {
    const res = await table(`orders?select=id&reference=eq.${reference}`);
    const rows = await res.json().catch(() => null);
    const orderId = Array.isArray(rows) ? rows[0]?.id : null;
    if (!orderId) continue;
    const t = await table(`tickets?select=id&order_id=eq.${orderId}`);
    const ticketRows = (await t.json().catch(() => [])) as Array<{ id: string }>;
    for (const ticket of ticketRows) {
      await table(`check_ins?ticket_id=eq.${ticket.id}`, { method: 'DELETE' });
    }
    await table(`tickets?order_id=eq.${orderId}`, { method: 'DELETE' });
    await table(`orders?id=eq.${orderId}`, { method: 'DELETE' });
  }
});

describe.skipIf(!ENABLED)('money path against the live project', () => {
  it('has the credentials it needs', () => {
    expect(URL_BASE, 'NEXT_PUBLIC_SUPABASE_URL missing from .env.local').toBeTruthy();
    expect(SERVICE, 'SUPABASE_SERVICE_ROLE_KEY missing from .env.local').toBeTruthy();
  });

  it('mints exactly one ticket however many times the webhook replays', async () => {
    const reference = `${PREFIX}${Date.now().toString(36).toUpperCase()}-REPLAY`;
    const { paid } = await createPaidOrder(reference);
    expect(paid?.outcome).toBe('paid');

    // Paystack retries non-2xx and can legitimately deliver the same event
    // more than once. Five replays must not become five tickets.
    for (let i = 0; i < 4; i++) {
      const again = await rpc('mark_order_paid', {
        p_reference: reference,
        p_amount_kobo: 0,
        p_channel: null,
        p_raw: { replay: i },
      });
      expect(again.row?.outcome).toBe('already_paid');
    }

    const res = await table(
      `tickets?select=id,orders!inner(reference)&orders.reference=eq.${reference}`
    );
    const tickets = await res.json();
    expect(Array.isArray(tickets) && tickets.length).toBe(1);
  });

  it('refuses a payment whose amount does not match the order', async () => {
    const reference = `${PREFIX}${Date.now().toString(36).toUpperCase()}-AMOUNT`;
    created.push(reference);
    await rpc('create_pending_order', {
      p_reference: reference,
      p_buyer_name: 'Integration Test',
      p_buyer_email: 'integration@invalid.local',
      p_buyer_phone: '+2348000000000',
      p_quantity: 1,
      p_unit_price_kobo: 300_000,
      p_service_charge_kobo: 22_500,
      p_fee_kobo: 4_913,
      p_total_kobo: 327_413,
    });
    // A charge for ₦100 against a ₦3,274 order mints nothing.
    const wrong = await rpc('mark_order_paid', {
      p_reference: reference,
      p_amount_kobo: 10_000,
      p_channel: 'card',
      p_raw: { integration_test: true },
    });
    expect(wrong.row?.outcome).toBe('amount_mismatch');

    const res = await table(
      `tickets?select=id,orders!inner(reference)&orders.reference=eq.${reference}`
    );
    expect((await res.json()).length).toBe(0);
  });

  it('reports an unknown reference rather than inventing an order', async () => {
    const unknown = await rpc('mark_order_paid', {
      p_reference: `${PREFIX}DOES-NOT-EXIST`,
      p_amount_kobo: 1,
      p_channel: null,
      p_raw: {},
    });
    expect(unknown.row?.outcome).toBe('not_found');
  });
});

describe.skipIf(!ENABLED || !DOOR_JWT)('the door race', () => {
  it('admits exactly one person when two phones scan the same code at once', async () => {
    const reference = `${PREFIX}${Date.now().toString(36).toUpperCase()}-RACE`;
    await createPaidOrder(reference);
    const code = await ticketCodeFor(reference);
    expect(code, 'no ticket was minted for the race fixture').toBeTruthy();

    const scannedAt = new Date().toISOString();
    // Genuinely concurrent. record_check_in decides first-scan-wins with a
    // single conditional UPDATE, so both statements reach the row and exactly
    // one of them may change it.
    const [a, b] = await Promise.all([
      rpc('record_check_in', { p_code: code, p_device: 'door-a', p_scanned_at: scannedAt }, DOOR_JWT),
      rpc('record_check_in', { p_code: code, p_device: 'door-b', p_scanned_at: scannedAt }, DOOR_JWT),
    ]);

    const outcomes = [a.row?.outcome, b.row?.outcome].sort();
    expect(outcomes).toEqual(['admitted', 'already_used']);
  });

  it('reports an unknown code as not_found, never as admitted', async () => {
    const result = await rpc(
      'record_check_in',
      { p_code: 'SGN-2345-6789', p_device: 'door-a', p_scanned_at: new Date().toISOString() },
      DOOR_JWT
    );
    expect(result.row?.outcome).toBe('not_found');
  });
});

describe.skipIf(!ENABLED)('the config and the database agree', () => {
  /**
   * capacity and the sales hard stop are stored twice on purpose — the
   * database enforces them so a client cannot ignore them, and the config
   * file drives the UI copy. The initial-schema migration says "if you change
   * one, change both in the same commit" and nothing has ever enforced that.
   *
   * A drift here is not cosmetic. Config higher than the database means the
   * page advertises seats checkout will refuse; database higher than config
   * means we oversell a hall that has a fire limit.
   */
  it('stores the same capacity the config advertises', async () => {
    const res = await table('event_settings?select=capacity,sales_open,sales_hard_stop');
    const [settings] = await res.json();

    expect(settings.capacity).toBe(eventConfig.ticketing.capacity);
  });

  it('stores the same sales hard stop the config advertises', async () => {
    const res = await table('event_settings?select=sales_hard_stop');
    const [settings] = await res.json();

    expect(new Date(settings.sales_hard_stop).toISOString()).toBe(
      new Date(eventConfig.ticketing.salesHardStopAt).toISOString()
    );
  });

  it('never advertises more seats than checkout will actually sell', async () => {
    // get_public_counter and create_pending_order both gate on capacity, and
    // used to count it differently: the counter ignored pending holds, so the
    // page could offer a seat checkout would then refuse.
    const counter = await rpc('get_public_counter', {});
    const held = await table(
      'orders?select=quantity&status=eq.pending&created_at=gte.' +
        new Date(Date.now() - 30 * 60_000).toISOString()
    );
    const holds: { quantity: number }[] = await held.json();
    const heldSeats = holds.reduce((sum, o) => sum + o.quantity, 0);

    const minted = counter.row.tickets_sold;
    expect(counter.row.tickets_remaining).toBe(
      Math.max(0, counter.row.capacity - minted - heldSeats)
    );
  });
});

// A skipped suite is silent, and silence here reads as a pass. Say so.
describe('integration coverage notice', () => {
  it('reports whether the live checks actually ran', () => {
    if (!ENABLED) {
      console.warn(
        '\n  ! Integration tests SKIPPED (INTEGRATION=1 not set). This is NOT a pass:\n' +
          '    the webhook-replay, amount-mismatch and two-phone-race properties\n' +
          '    are unproven until they run against the live project.\n'
      );
    } else if (!DOOR_JWT) {
      console.warn('\n  ! Door-race suite SKIPPED — no DOOR_JWT. This is NOT a pass.\n');
    }
    expect(true).toBe(true);
  });
});
