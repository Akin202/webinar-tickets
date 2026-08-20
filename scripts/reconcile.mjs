#!/usr/bin/env node
/**
 * Reconciliation — what Paystack thinks happened vs what our database thinks.
 *
 *   node scripts/reconcile.mjs                      # last 7 days
 *   node scripts/reconcile.mjs --from 2026-08-25 --to 2026-08-26
 *   node scripts/reconcile.mjs --json               # machine-readable
 *
 * Same shape as rls-attack.mjs: zero-dependency plain .mjs, reads
 * .env.local by hand, runs with nothing installed. On event week the last
 * thing anyone needs is an npm install.
 *
 * This exists so that "did this person actually pay?" is answerable without
 * opening two dashboards and squinting. It reports in BOTH directions,
 * because the two failures look nothing alike:
 *
 *   PAID_NOT_RECORDED  Paystack took their money, our orders table does not
 *                      say paid. They are owed a ticket. This is the one that
 *                      becomes a WhatsApp message from someone you know.
 *
 *   RECORDED_NOT_PAID  We marked an order paid with no successful Paystack
 *                      transaction behind it. Should be impossible — only
 *                      mark_order_paid flips the status and only the webhook
 *                      and verify paths call it — so if it ever fires, treat
 *                      it as a compromise, not a glitch. Comped orders are
 *                      excluded: they are zero-value by construction.
 *
 *   AMOUNT_MISMATCH    Both sides agree it is paid, and disagree on how much.
 *
 * Exits non-zero if any discrepancy is found, so it can gate a deploy.
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
const PAYSTACK = env.PAYSTACK_SECRET_KEY;

if (!URL_BASE || !SERVICE || !PAYSTACK) {
  console.error(
    '✗ Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ' +
      'PAYSTACK_SECRET_KEY in .env.local'
  );
  process.exit(1);
}

// ---- args ----------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};
const asJson = argv.includes('--json');

const today = new Date();
const defaultFrom = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
const from = flag('from') ?? defaultFrom.toISOString().slice(0, 10);
const to = flag('to') ?? today.toISOString().slice(0, 10);

// ---- paystack ------------------------------------------------------------
/** Every transaction in the window, following pagination to the end. */
async function paystackTransactions() {
  const out = [];
  let page = 1;

  for (;;) {
    // Full timestamps, not bare dates. Paystack reads `to=2026-08-25` as
    // midnight AT THE START of that day, so a bare date silently drops every
    // transaction made on the last day of the window — which on event week is
    // every transaction that matters. Getting this wrong makes the script
    // report that nobody is owed a ticket while people are owed tickets.
    const url =
      `https://api.paystack.co/transaction` +
      `?perPage=100&page=${page}` +
      `&from=${encodeURIComponent(`${from}T00:00:00Z`)}` +
      `&to=${encodeURIComponent(`${to}T23:59:59Z`)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${PAYSTACK}` },
    });
    if (!res.ok) {
      console.error(`✗ Paystack returned ${res.status} on page ${page}`);
      process.exit(1);
    }
    const body = await res.json();
    const batch = body?.data ?? [];
    out.push(...batch);

    // Trust the reported page count, but stop on a short page regardless so a
    // wrong total can never spin this forever.
    const total = body?.meta?.pageCount ?? 1;
    if (batch.length < 100 || page >= total) break;
    page += 1;
  }
  return out;
}

// ---- database ------------------------------------------------------------
async function orders() {
  const url =
    `${URL_BASE}/rest/v1/orders` +
    `?select=reference,status,total_kobo,buyer_name,buyer_email,created_at,paid_at` +
    `&created_at=gte.${from}T00:00:00Z&created_at=lte.${to}T23:59:59Z`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!res.ok) {
    console.error(`✗ Supabase returned ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  return res.json();
}

// ---- diff ----------------------------------------------------------------
const [txns, rows] = await Promise.all([paystackTransactions(), orders()]);

const successful = new Map();
for (const t of txns) {
  if (t.status === 'success' && t.reference) successful.set(t.reference, t);
}
const byReference = new Map(rows.map((o) => [o.reference, o]));

const findings = [];

// Direction 1: Paystack says paid, we do not.
for (const [reference, txn] of successful) {
  const order = byReference.get(reference);
  if (!order) {
    findings.push({
      kind: 'PAID_NOT_RECORDED',
      reference,
      detail: `Paystack has a successful ${txn.amount} kobo charge with no order row at all`,
      paystackKobo: txn.amount,
      email: txn.customer?.email ?? null,
    });
    continue;
  }
  if (order.status !== 'paid') {
    findings.push({
      kind: 'PAID_NOT_RECORDED',
      reference,
      detail: `order status is '${order.status}' but Paystack charged ${txn.amount} kobo`,
      paystackKobo: txn.amount,
      orderKobo: order.total_kobo,
      email: order.buyer_email,
    });
    continue;
  }
  if (order.total_kobo !== txn.amount) {
    findings.push({
      kind: 'AMOUNT_MISMATCH',
      reference,
      detail: `we recorded ${order.total_kobo} kobo, Paystack charged ${txn.amount}`,
      paystackKobo: txn.amount,
      orderKobo: order.total_kobo,
      email: order.buyer_email,
    });
  }
}

// Direction 2: we say paid, Paystack has no successful transaction.
for (const order of rows) {
  if (order.status !== 'paid') continue;
  if (successful.has(order.reference)) continue;
  // Comps are minted through the same path at zero value and never touch
  // Paystack, so their absence here is correct rather than suspicious.
  if (order.total_kobo === 0) continue;

  findings.push({
    kind: 'RECORDED_NOT_PAID',
    reference: order.reference,
    detail:
      `marked paid at ${order.paid_at} for ${order.total_kobo} kobo, but ` +
      `Paystack has no successful transaction in this window`,
    orderKobo: order.total_kobo,
    email: order.buyer_email,
  });
}

// ---- report --------------------------------------------------------------
if (asJson) {
  console.log(JSON.stringify({ from, to, txns: txns.length, orders: rows.length, findings }, null, 2));
  process.exit(findings.length ? 1 : 0);
}

const naira = (kobo) =>
  `₦${(kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const paidOrders = rows.filter((o) => o.status === 'paid');
const recordedKobo = paidOrders.reduce((sum, o) => sum + o.total_kobo, 0);
const paystackKobo = [...successful.values()].reduce((sum, t) => sum + t.amount, 0);

console.log(`\nReconciliation  ${from} → ${to}`);
console.log('─'.repeat(60));
console.log(`  Paystack successful transactions   ${successful.size}  (${naira(paystackKobo)})`);
console.log(`  Orders marked paid                 ${paidOrders.length}  (${naira(recordedKobo)})`);
console.log(`  Orders in window (any status)      ${rows.length}`);

if (findings.length === 0) {
  console.log(`\n  \x1b[32m✓ Both sides agree.\x1b[0m No discrepancies.\n`);
  process.exit(0);
}

const groups = {
  PAID_NOT_RECORDED: 'MONEY TAKEN, NO TICKET — these people are owed something',
  RECORDED_NOT_PAID: 'TICKET ISSUED, NO PAYMENT — should be impossible, investigate',
  AMOUNT_MISMATCH: 'AMOUNTS DISAGREE',
};

for (const [kind, heading] of Object.entries(groups)) {
  const hits = findings.filter((f) => f.kind === kind);
  if (!hits.length) continue;
  console.log(`\n  \x1b[31m${heading}\x1b[0m  (${hits.length})`);
  for (const f of hits) {
    console.log(`    ${f.reference}${f.email ? `  <${f.email}>` : ''}`);
    console.log(`      ${f.detail}`);
  }
}

console.log(`\n  \x1b[31m${findings.length} discrepancy/ies.\x1b[0m Resolve before refunding anyone.\n`);
process.exit(1);
