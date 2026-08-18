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

console.log('\n3. anon calling privileged functions');
for (const fn of ['get_check_in_manifest', 'set_sales_open', 'record_check_in']) {
  const { status, json } = await req(`rpc/${fn}`, { method: 'POST', body: {} });
  const rows = Array.isArray(json) ? json : null;
  status === 200 && rows && rows.length
    ? fail(`anon executed ${fn}() and got ${rows.length} row(s)`)
    : pass(`anon blocked from ${fn}() (HTTP ${status})`);
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
  console.log('    Auth does not exist yet. Re-run with DOOR_JWT=<door user jwt> once it does;');
  console.log('    a door steward reaching buyer_email is the leak anon tests cannot catch.');
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
