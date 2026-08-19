#!/usr/bin/env node
/**
 * RLS attack script — the check behind the privacy constraint in CLAUDE.md.
 *
 *   node scripts/rls-attack.mjs
 *
 * Deliberately zero-dependency and plain .mjs rather than .ts:
 *  - it hits the raw PostgREST HTTP surface an attacker actually uses, not a
 *    client library that might soften the result
 *  - it runs with nothing installed, which matters on event week
 *
 * Exits non-zero if ANY assertion fails. Wire it into CI before go-live.
 * Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from
 * .env.local. Never give this the service-role key — that key is meant to
 * bypass RLS, so passing it here would make every test pass and prove nothing.
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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DOOR_JWT = process.env.DOOR_JWT ?? null;

if (!URL_BASE || !ANON) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing from .env.local');
  process.exit(1);
}
if (/service_role|SUPABASE_SERVICE_ROLE/i.test(ANON)) {
  console.error('✗ REFUSING TO RUN: that looks like a service-role key. It bypasses RLS by design.');
  process.exit(1);
}

let failures = 0;
const pass = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const fail = (m, d) => { failures++; console.log(`  \x1b[31m✗ ${m}\x1b[0m${d ? `\n      ${d}` : ''}`); };

async function req(path, { token = ANON, method = 'GET', body } = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body is fine */ }
  return { status: res.status, json };
}

/** A table is safe if the request errors OR returns zero rows. */
async function assertNoRows(table, token, label) {
  const { status, json } = await req(`${table}?select=*&limit=1`, { token });
  const rows = Array.isArray(json) ? json : null;
  if (rows && rows.length > 0) {
    fail(`${label} CAN READ ${table} — ${rows.length} row(s) exposed`,
         JSON.stringify(rows[0]).slice(0, 160));
  } else if (rows) {
    pass(`${label} blocked on ${table} (200 but zero rows — RLS filtered)`);
  } else {
    pass(`${label} blocked on ${table} (HTTP ${status})`);
  }
}

const TABLES = ['orders', 'tickets', 'check_ins', 'staff_users', 'event_settings', 'settings_audit'];

console.log(`\nRLS attack — ${URL_BASE}\n`);

console.log('1. anon key against every table');
for (const t of TABLES) await assertNoRows(t, ANON, 'anon');

console.log('\n2. anon reaching money through the counter');
{
  const { status, json } = await req('rpc/get_public_counter', { method: 'POST', body: {} });
  const row = Array.isArray(json) ? json[0] : json;
  if (status !== 200 || !row) {
    fail(`get_public_counter() unreachable by anon (HTTP ${status}) — the public page needs this`,
         JSON.stringify(json).slice(0, 160));
  } else {
    pass('get_public_counter() reachable by anon');
    const leaked = Object.keys(row).filter((k) => /kobo|gross|net|revenue|channel|fee|charge/i.test(k));
    leaked.length
      ? fail(`counter leaks money fields: ${leaked.join(', ')}`)
      : pass(`counter carries no money fields (${Object.keys(row).join(', ')})`);
  }
}

/**
 * Arguments that MATCH each function's real signature.
 *
 * This used to post `{}` to every function. PostgREST answers a call whose
 * arguments match no overload with 404 — the same shape as "you may not call
 * this" — so every one of these assertions passed on argument mismatch and
 * would have kept passing with the EXECUTE grant wide open. The test proved
 * nothing about permissions. Sending the real signature makes a 404 mean
 * "denied" and a 200 mean "we have a problem".
 *
 * Each payload is chosen so that succeeding is as close to harmless as the
 * call allows, because a success here means the grant is open and the call
 * WILL have run:
 *
 *   set_sales_open      re-asserts the CURRENT state, so it is a no-op
 *   record_check_in     a code that does not exist -> not_found, no admission
 *   mark_order_paid     a reference that does not exist -> not_found, no mint
 *   create_pending_order the one that cannot be made harmless — it would hold
 *                       a seat. Marked RLSATTACK- so it is findable, and its
 *                       existence is itself the alarm.
 */
const NO_SUCH_CODE = 'SGN-2345-6789';
const NO_SUCH_REF = `RLSATTACK-${Date.now().toString(36).toUpperCase()}`;

// Read the live gate first so the set_sales_open probe cannot change it.
let salesCurrentlyOpen = true;
{
  const { json } = await req('rpc/get_public_counter', { method: 'POST', body: {} });
  const row = Array.isArray(json) ? json[0] : json;
  if (row && typeof row.sales_closed === 'boolean') salesCurrentlyOpen = !row.sales_closed;
}

const PRIVILEGED = [
  ['get_check_in_manifest', {}],
  ['set_sales_open', { p_open: salesCurrentlyOpen }],
  ['record_check_in', { p_code: NO_SUCH_CODE, p_device: 'rls-attack', p_scanned_at: new Date().toISOString() }],
];

console.log('\n3. anon calling privileged functions');
for (const [fn, body] of PRIVILEGED) {
  const { status, json } = await req(`rpc/${fn}`, { method: 'POST', body });
  // Any 200 is a failure, even with zero rows. EXECUTE itself is revoked
  // from anon, so the request must die at the grant (401/403), not get
  // into the function body and rely on its internal role check. A 200 with
  // an empty result is exactly what the pre-fix implicit PUBLIC grant
  // produced — do not let that score as blocked again.
  status === 200
    ? fail(`anon executed ${fn}() (HTTP 200${Array.isArray(json) && json.length ? `, ${json.length} row(s)` : ', empty'}) — EXECUTE grant is open`)
    : pass(`anon blocked from ${fn}() (HTTP ${status})`);
}

console.log('\n3b. the money functions — service-role only');
// create_pending_order and mark_order_paid are the two writes that decide
// capacity and mint tickets. Neither has any grant: they are called only by the
// API routes with the service-role key. A browser that could reach
// mark_order_paid would mint itself free tickets, so this is checked for both
// anon AND an authenticated staff session — a signed-in door steward is still a
// browser, and "authenticated" is not "trusted".
const MONEY = [
  [
    'create_pending_order',
    {
      p_reference: NO_SUCH_REF,
      p_buyer_name: 'RLS Attack Probe',
      p_buyer_email: 'rls-attack@invalid.local',
      p_buyer_phone: '+2348000000000',
      p_quantity: 1,
      p_unit_price_kobo: 0,
      p_service_charge_kobo: 0,
      p_fee_kobo: 0,
      p_total_kobo: 0,
    },
  ],
  ['mark_order_paid', { p_reference: NO_SUCH_REF, p_amount_kobo: 0, p_channel: null, p_raw: {} }],
];

for (const [fn, body] of MONEY) {
  const { status } = await req(`rpc/${fn}`, { method: 'POST', body });
  status === 200
    ? fail(`anon executed ${fn}() — the money path is reachable from a browser`)
    : pass(`anon blocked from ${fn}() (HTTP ${status})`);

  if (DOOR_JWT) {
    const { status: doorStatus } = await req(`rpc/${fn}`, {
      token: DOOR_JWT,
      method: 'POST',
      body,
    });
    doorStatus === 200
      ? fail(`DOOR ROLE executed ${fn}() — a staff session can mint or reserve tickets`)
      : pass(`door blocked from ${fn}() (HTTP ${doorStatus})`);
  }
}

// If either call above got through, it left a row. Say where to look.
{
  const { json } = await req(`orders?select=reference&reference=eq.${NO_SUCH_REF}`, {
    token: DOOR_JWT ?? ANON,
  });
  if (Array.isArray(json) && json.length) {
    fail(`the probe order ${NO_SUCH_REF} EXISTS — it holds a seat. Delete it by hand.`);
  }
}

console.log('\n4. ticket code enumeration');
{
  const guesses = ['SGN-AAAA-AAAA', 'SGN-2222-2222', 'SGN-2345-6789'];
  let exposed = 0;
  for (const code of guesses) {
    const { json } = await req(`tickets?code=eq.${code}&select=*`);
    if (Array.isArray(json) && json.length) exposed++;
  }
  exposed
    ? fail(`${exposed}/${guesses.length} guessed codes returned a ticket`)
    : pass('guessed ticket codes return nothing to anon');
}

console.log('\n5. door role — the leak that is not anon');
if (!DOOR_JWT) {
  console.log('  \x1b[33m! SKIPPED\x1b[0m — no DOOR_JWT set. This is NOT a pass.');
  console.log('    A door steward reaching buyer_email is the leak anon tests cannot catch,');
  console.log('    so run this section before go-live. The door account already exists');
  console.log('    (config/event.config.ts -> staff.scannerEmail); its password is the gate');
  console.log('    PIN you gave scripts/seed-staff.mjs. Get a token with:');
  console.log('      curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \\');
  console.log('        -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \\');
  console.log('        -d \'{"email":"<door account>","password":"<gate PIN>"}\'');
  console.log('    then re-run as: DOOR_JWT=<access_token> node scripts/rls-attack.mjs');
  console.log('    Note: with no tickets issued, the five-column manifest assertion cannot');
  console.log('    run — seed one paid order first or that check silently does nothing.');
} else {
  await assertNoRows('orders', DOOR_JWT, 'door');
  await assertNoRows('settings_audit', DOOR_JWT, 'door');
  const { status, json } = await req('rpc/get_check_in_manifest', { token: DOOR_JWT, method: 'POST', body: {} });
  const row = Array.isArray(json) ? json[0] : null;
  if (status !== 200) {
    fail(`door cannot read its own manifest (HTTP ${status}) — the scanner needs this`);
  } else if (row) {
    const allowed = ['id', 'code', 'holder_name', 'holder_phone', 'status'];
    const extra = Object.keys(row).filter((k) => !allowed.includes(k));
    extra.length
      ? fail(`manifest exposes extra columns to door: ${extra.join(', ')}`)
      : pass('door manifest carries exactly the five permitted columns');
  } else {
    pass('door manifest reachable (no tickets issued yet)');
  }
  const sales = await req('rpc/set_sales_open', { token: DOOR_JWT, method: 'POST', body: { p_open: false } });
  sales.status === 200
    ? fail('DOOR ROLE CLOSED SALES — set_sales_open must be admin-only')
    : pass(`door blocked from set_sales_open() (HTTP ${sales.status})`);
}

console.log(
  failures
    ? `\n\x1b[31m${failures} assertion(s) FAILED — do not distribute the sales link.\x1b[0m\n`
    : `\n\x1b[32mAll assertions passed.\x1b[0m Views are not covered here — run get_advisors (security) too.\n`
);
process.exit(failures ? 1 : 0);
