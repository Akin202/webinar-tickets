#!/usr/bin/env node
/**
 * Purge test data from the ticketing tables, so go-live starts from zero.
 *
 *   node scripts/purge-test-data.mjs              # dry run — counts only, writes nothing
 *   node scripts/purge-test-data.mjs --confirm    # actually delete
 *
 * Everything currently in the database was written by a test: the integration
 * suite's INTEG-* rows, and manual purchases made against Paystack TEST keys.
 * None of it is a real sale, and all of it is a problem at go-live — minted
 * tickets hold seats against capacity, and test buyers appear in the admin
 * list and the CSV export alongside real people.
 *
 * Same shape as rls-attack.mjs and reconcile.mjs: zero-dependency plain .mjs,
 * reads .env.local by hand, runs with nothing installed.
 *
 * THIS DELETES EVERY ROW IN check_ins, tickets, orders AND settings_audit.
 * It is not a filter and it is not selective — that is the whole point of it,
 * and it is why the guards below exist:
 *
 *   * dry run is the default; --confirm is required to write anything
 *   * it refuses to run at all when PAYSTACK_SECRET_KEY is a live key, unless
 *     you also pass --yes-i-am-deleting-real-sales. Once real money has moved
 *     through this database, wiping the orders table destroys the only record
 *     of who paid you. The Paystack key is the most reliable signal available
 *     for "are we past go-live", so it is the one this leans on.
 *   * it refuses above --max rows (default 200) without an explicit raise, so
 *     a forgotten invocation after the sales link goes out cannot quietly take
 *     four hundred buyers with it.
 *
 * check_ins is documented as an append-only audit log. The service-role key
 * bypasses that by design; deleting a test-era audit trail before any real
 * scan has happened is the intended use, and the only one.
 *
 * Capacity is re-asserted afterwards from config/event.config.ts, because
 * tests/integration.test.ts temporarily lowers the live event_settings row and
 * a crashed run can leave it there.
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const PAYSTACK = env.PAYSTACK_SECRET_KEY ?? '';

if (!URL_BASE || !SERVICE) {
  console.error('✗ Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// ---- args ----------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};

const CONFIRM = has('confirm');
const MAX_ROWS = Number(flag('max') ?? 200);
const ALLOW_LIVE = has('yes-i-am-deleting-real-sales');

// ---- guard: live keys ----------------------------------------------------
if (PAYSTACK.startsWith('sk_live_') && !ALLOW_LIVE) {
  console.error(
    '\n✗ REFUSING TO RUN — PAYSTACK_SECRET_KEY is a LIVE key.\n' +
      '  This script deletes every order, ticket and check-in. If real money has\n' +
      '  moved, those rows are your only record of who paid you.\n\n' +
      '  If you genuinely mean it, re-run with --yes-i-am-deleting-real-sales,\n' +
      '  and export the buyer list from /admin first.\n'
  );
  process.exit(1);
}

// ---- capacity, from the config that is the source of truth ----------------
/**
 * Parsed rather than imported: this file stays zero-dependency and runnable
 * with nothing installed, and config/event.config.ts is TypeScript. A missed
 * match is fatal instead of silently defaulting — writing a guessed capacity
 * into the live settings row would be worse than not touching it.
 */
function configCapacity() {
  const source = readFileSync(new URL('../config/event.config.ts', import.meta.url), 'utf8');
  const match = source.match(/capacity:\s*(\d+)/);
  if (!match) {
    console.error('✗ Could not read `capacity` from config/event.config.ts — refusing to guess.');
    process.exit(1);
  }
  return Number(match[1]);
}

// ---- http ----------------------------------------------------------------
async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    console.error(`✗ Supabase returned ${res.status} on ${path}: ${await res.text()}`);
    process.exit(1);
  }
  return res;
}

/** Exact row count without pulling the rows. */
async function count(table) {
  const res = await rest(`${table}?select=id`, {
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  const range = res.headers.get('content-range') ?? '*/0';
  return Number(range.split('/')[1] ?? 0);
}

// Child tables first: tickets.order_id is ON DELETE RESTRICT, so orders can
// only go once nothing points at them.
const TABLES = ['check_ins', 'tickets', 'orders', 'settings_audit'];

// ---- report --------------------------------------------------------------
console.log(`\nPurge test data — ${URL_BASE}\n`);
console.log(`  Paystack key: ${PAYSTACK.slice(0, 8) || '(unset)'}…\n`);

const before = {};
for (const table of TABLES) before[table] = await count(table);

for (const table of TABLES) {
  console.log(`  ${table.padEnd(16)} ${String(before[table]).padStart(5)} row(s)`);
}

const total = Object.values(before).reduce((a, b) => a + b, 0);
console.log(`  ${'TOTAL'.padEnd(16)} ${String(total).padStart(5)} row(s)\n`);

if (total === 0) {
  console.log('  Nothing to delete — the tables are already empty.\n');
}

// A sample of what is about to go, so a dry run is actually reviewable.
if (before.orders > 0) {
  const sample = await (
    await rest('orders?select=reference,status,buyer_name,buyer_email,total_kobo&order=created_at.desc&limit=10')
  ).json();
  console.log('  Most recent orders that would be deleted:');
  for (const o of sample) {
    console.log(
      `    ${o.reference.padEnd(24)} ${o.status.padEnd(10)} ` +
        `₦${(o.total_kobo / 100).toFixed(2).padStart(10)}  ${o.buyer_name} <${o.buyer_email}>`
    );
  }
  console.log('');
}

if (total > MAX_ROWS) {
  console.error(
    `✗ ${total} rows is above the --max ceiling of ${MAX_ROWS}. That is a lot more than a\n` +
      `  test database should hold. Check what is in there, then re-run with --max ${total}\n` +
      `  if it really is all disposable.\n`
  );
  process.exit(1);
}

if (!CONFIRM) {
  console.log('  DRY RUN — nothing was deleted. Re-run with --confirm to write.\n');
  process.exit(0);
}

// ---- delete --------------------------------------------------------------
console.log('  Deleting…\n');
for (const table of TABLES) {
  // PostgREST refuses an unfiltered DELETE. `id=not.is.null` matches every row
  // and says so explicitly, rather than relying on a filter that happens to be
  // total.
  await rest(`${table}?id=not.is.null`, { method: 'DELETE' });
  console.log(`  ✓ ${table} cleared`);
}

// ---- restore capacity ----------------------------------------------------
const capacity = configCapacity();
await rest('event_settings?id=eq.true', {
  method: 'PATCH',
  body: JSON.stringify({ capacity }),
});
console.log(`  ✓ event_settings.capacity re-asserted to ${capacity}\n`);

// ---- verify --------------------------------------------------------------
let dirty = 0;
for (const table of TABLES) {
  const remaining = await count(table);
  if (remaining !== 0) {
    dirty++;
    console.error(`  ✗ ${table} still holds ${remaining} row(s)`);
  }
}

const settings = await (await rest('event_settings?select=capacity,sales_open')).json();
console.log(
  `  event_settings: capacity=${settings[0]?.capacity} sales_open=${settings[0]?.sales_open}\n`
);

if (dirty) {
  console.error('✗ Purge incomplete — see above.\n');
  process.exit(1);
}
console.log('✓ Clean. The database is ready for real sales.\n');
