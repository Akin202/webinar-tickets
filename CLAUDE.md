# Sign-Out Tickets

## What this is
A single-event ticketing platform for the UNILAG Faculty of Engineering
final-year sign-out after-party. Students buy a ticket online via Paystack and
receive a QR code; door staff scan those codes to control entry to a hall with a
hard capacity limit.

The visual layer was generated in Google AI Studio as a React + Vite SPA and is
largely finished. My job in this repo is the engineering: migrating it to
Next.js, then database, Paystack integration, auth, offline sync, and deployment.

## The actual product
This is not a payments site — payments are the easy part. **It is a door-control
tool.** On event night, two staff stand at a hall entrance with bad lighting and
no usable network, facing a queue of attendees, some of whom are presenting
WhatsApp screenshots of other people's QR codes.

Two audiences, two jobs:
1. **Buyers** — anyone. The event is hosted by the Faculty of Engineering, but
   attendees are not all engineering students, not all UNILAG students, and not
   necessarily students at all. Collect nothing that assumes otherwise. They buy
   on a mid-tier Android phone on mobile data, from a link forwarded on
   WhatsApp. Must work on a slow connection and a small screen.
2. **Door staff** — scan, standing, one-handed, in a hurry, offline.
   **`/scan` is the highest-stakes surface in the app.** If it is slow, wrong,
   or ambiguous, the event fails in public. Budget accordingly.

The two defences against screenshot-sharing are non-negotiable: codes are
**single-use, first scan wins**, and the scan result always displays the
**holder's name and phone number** so staff can challenge identity ("what's
your number?"). A green tick alone is worthless. `Ticket.holderPhone` is
denormalised off the order for exactly this reason — the scanner caches Ticket
rows in IndexedDB and never sees an Order, so the identity check has to travel
with the ticket or `/scan` goes blind offline. It is deliberately not editable
by the holder.

## Stack
- Next.js 15 (App Router), TypeScript — migrated from the Vite SPA AI Studio emitted
- Tailwind, hand-rolled components (no component library)
- Supabase — Postgres, RLS, Realtime, Auth. Project ref `adbzxxzyqeurjfrrenme`,
  reachable from the agent over MCP (`.mcp.json`, features: docs, database,
  debugging, development, functions).
- Paystack — Initialize Transaction + `charge.success` webhook
- Resend for email (backup delivery only — WhatsApp is the primary channel)
- Vercel

## Contracts — do not break these
- `/types/ticketing.ts` — the data model. The database schema must match it
  exactly. Change types only with a deliberate reason and a migration in the
  same commit.
- `/config/event.config.ts` — every instance-specific string, colour, price,
  date, and asset path. **Never hardcode these into a component.** This file is
  what makes the build reusable for the next faculty's event.
- `/lib/data-access.ts` — the only seam between UI and database. Replace the
  bodies with real queries; do not change the signatures. (Changed once, on
  purpose, when matric number was removed from the model: `initiatePurchase`
  lost `buyerMatricNumber`, `renameTicketHolder` dropped its third argument,
  and `issueComplimentaryTicket` takes `holderPhone`. No migration was owed —
  no schema had been pushed yet.)

## Conventions
- `// TODO(handoff):` marks every spot where real logic belongs. Grep for them.
- Presentational components stay pure — props in, JSX out. Data fetching lives
  in server components or `data-access.ts`, never in a UI component.
- **All money is integer kobo.** No floats anywhere near an amount.
- The public page is a party; `/admin` and `/scan` are tools. They deliberately
  do not share a design language. Do not "improve" the admin toward the
  consumer aesthetic.
- The client never decides payment status. Only the Paystack webhook does.

## Hard constraints
- **Trust:** students are handing over real money for an event that hasn't
  happened yet, and most of them know me personally. A double-charge or a lost
  ticket is a reputational problem, not a bug. Every money path must be
  idempotent and every write atomic.
- **Offline:** `/scan` must complete a full scan-to-result cycle with the device
  in airplane mode. This is a functional requirement, not a nice-to-have — the
  hall has no usable network.
- **Performance:** public page LCP under 2.5s on Slow 4G with 4x CPU throttle.
  Scan-to-result under 300ms with a warm cache.
- **Privacy:** the buyer list contains the names, email addresses and phone
  numbers of ~400 identifiable people. It must be impossible to read any of it
  with the public anon key. RLS on every table, verified by an actual attack
  script. `&read_only=true` is now set on the Supabase MCP URL in `.mcp.json`
  — from this point the buyer list is real PII and no agent gets write access
  to it outside a reviewed migration. Do not remove that flag to make a task
  easier.
- **Link previews:** the URL is distributed on WhatsApp. OG tags must be in the
  server-rendered HTML — WhatsApp's crawler does not execute JavaScript.
- **Accessibility:** 4.5:1 minimum contrast. Scanner states must be
  distinguishable without colour.
- **Motion:** animate only `transform` and `opacity`, all wrapped in the
  reduced-motion check. `/scan` has no animation at all.

## Commands
```bash
npm run dev
npm run build             # must pass before any commit
npm test                  # 59 unit tests, no network
npx supabase db push

node scripts/rls-attack.mjs        # 13/13; add DOOR_JWT= for section 5
node scripts/reconcile.mjs         # Paystack vs orders, both directions
node scripts/purge-test-data.mjs   # dry run; --confirm to actually clear
node scripts/seed-staff.mjs        # create an admin or door account
```

The lockfile is **`bun.lock`**, not `package-lock.json` — AI Studio switched it
and Vercel builds from it. The `npm run` scripts above still work against an
existing `node_modules`, but `npm ci` will fail with no `package-lock.json`.
Install with `bun install`. Do not commit both lockfiles: two of them make
Vercel's package-manager detection nondeterministic.

## Layout
```
app/                 App Router routes. Thin server components that export
                     `metadata` and render a client component from
                     components/pages/.
components/pages/    The page bodies ("use client").
components/          Presentational components.
components/dev/      DevStateProvider — dev-only forced-state context.
lib/                 data-access (the seam), theme, offline-db, email,
                     pass-export, api/ (route helpers).
hooks/               useReducedMotion, useOfflineShell.
public/sw.js         The door scanner's offline shell.
tests/               vitest. `npm test`; integration is env-gated.
config/ types/       The contracts.
```

## Current state

**Everything on the nine-package finish plan is built, and it is deployed.**
`npm run build`, `npm run lint` and `npm test` (59) all pass clean. Zero
`TODO(handoff)` markers remain.

**`main` is the only trunk.** It briefly was not: the visual work is authored
in Google AI Studio and pushed to `main` through AI Studio's GitHub
integration (which is why `metadata.json` and `assets/.aistudio/` live in the
tree), while the hardening work sat on `security/production-pass`. Vercel
deploys `main`, so for a while production was running the app *without* the
seat release, body caps, webhook rate limit, error boundaries or
`/api/health`. Merged at `483f992` on 2026-08-20. **Do not open a long-lived
parallel branch again** — AI Studio pushes to `main`, so anything not on
`main` is invisible to it and to production.

**Deployed on Vercel** at `lastdance.tickitid.online` (DNS resolves to Vercel,
TLS live). `/api/health` returns `{"ok":true,"database":true,"paystack":true}`.
Live Paystack keys are set in Vercel; `.env.local` is still on `sk_test_`, and
that difference matters — see the purge note below. `NEXT_PUBLIC_SITE_URL`
should stay UNSET in Vercel: `.env.local` says `localhost:3000` and the config
fallback (`eventConfig.seo.siteUrl`) is already correct. Confirmed correct in
production — `og:url` renders as `https://lastdance.tickitid.online`.

**The backend is live.** Supabase project `adbzxxzyqeurjfrrenme`, 5 migrations
applied and a sixth written but not yet pushed (see "What is left"),
versions match the remote history. Six tables, RLS enabled and
forced, all grants revoked from anon/authenticated. The only anon-reachable
surface is `get_public_counter()`, which returns counts and no money.
`node scripts/rls-attack.mjs` passes 13/13 — **except section 5 (door-role
leakage), which has never run** because it needs a `DOOR_JWT`. That is no
longer blocked: both staff accounts exist, so the token is obtainable.

Grants were verified independently of the script, with
`has_function_privilege` against the live catalog: `mark_order_paid` and
`create_pending_order` are service-role only, `get_public_counter` is anon,
and the rest are `authenticated` plus an internal `current_staff_role()`
check. The `SECURITY DEFINER` warnings from `get_advisors` are those
by-design surfaces, not findings.

Wired and verified against the live project:
- **Checkout** — `POST /api/checkout`. Amount computed server-side from config
  via `computeOrderTotals`; the client cannot send a price. Capacity and the
  sales gate are checked atomically inside `create_pending_order`. Rate-limited
  per IP and per phone.
- **Payment** — `POST /api/webhooks/paystack` verifies HMAC-SHA512 over the raw
  body before parsing, then settles through `mark_order_paid` — the single
  idempotent flip. `/api/orders/[reference]` lazily verifies with Paystack and
  settles through the same function, so whichever lands second is a no-op.
  Migration 4 added the capacity re-check that stopped a late payment minting
  past capacity.
- **Door** — `record_check_in` decides first-scan-wins with one conditional
  UPDATE, and clamps a client-supplied `p_scanned_at` to `now()`.
- **Offline shell** — `public/sw.js`, a hand-rolled service worker registered
  only from `/scan`. Network-first on the `/scan` document, cache-first on
  `/_next/static/*`, everything else passed through untouched; `/api/*`,
  `/ticket/*`, `/admin*`, `/` and `/checkout` denied by name. The page reports
  the assets it actually loaded so the FIRST online visit is enough. `/scan`
  shows **Offline ready** vs **Preparing…** in the top bar.
- **Auth** — six-digit gate PIN is the door terminal account's password;
  `/admin/login` is email+password with an admin role check. Role is read from
  `staff_users`, never from JWT metadata. Create accounts with
  `node scripts/seed-staff.mjs`.
- **Admin API** — `/api/admin/*` behind `requireStaffRequest`: role check,
  same-origin check on mutations, per-staff and per-IP rate limits, audit rows
  on export, void, comp, rename and resend.
- **Save Pass** — real PNG export (`lib/pass-export.ts`), drawn on a canvas
  with the QR serialised out of the live DOM. Share sheet where available,
  download otherwise.
- **Email** — Resend via plain fetch (`lib/email.ts`), sent on the transition
  to paid only, through Next 15's `after()`. Admin resend button reports the
  server's real answer.
- **Tests** — `npm test`, 59 passing: money sweep, parsers, CSV guard, webhook
  signature gate, email. `npm run test:integration` **has run** against the
  live project: webhook replay, amount mismatch, the two-phone door race and
  the 50-buyer capacity race all pass. The capacity race is now gated behind a
  second flag (`INTEGRATION_CAPACITY=1`) because it writes to the live
  `event_settings` row — do not run it during event week.

### What is left

**Blocked on the human, not on the agent:**
1. **Resend is unverified.** `send.tickitid.online` has no DNS records, so the
   backup delivery channel does not work.
2. **Real-Android airplane-mode drill.** The offline shell is unproven on
   hardware — devtools offline mode is not the same thing. The service worker
   caches by asset hash, so this has to be redone after any deploy.
3. **Section 5 of the attack script.** Unblocked now; needs a `DOOR_JWT`.
4. **The anti-spam migration is written but NOT APPLIED.**
   `supabase/migrations/20260823102214_hold_window_and_phone_cap.sql` needs
   `npx supabase db push`, which needs `supabase link` and the database
   password. Until it runs, the hold window is still 30 minutes, there is no
   per-phone cap, and — the urgent part — **`event_settings.sales_hard_stop`
   is still `2026-08-26T03:00Z`, i.e. 04:00 WAT on the morning of the party.**
   Enforcement reads that row, not `config/event.config.ts`, so as it stands
   checkout starts refusing everybody about nineteen hours before doors open
   with most of the hall unsold. The migration corrects it to the 27th and
   audits the change.

### Vercel's firewall is blocking the Paystack webhook

Attack Challenge Mode is on **site-wide**, `/api/*` included. Verified
2026-08-23:

```
POST /api/webhooks/paystack  ->  403,  x-vercel-mitigated: challenge
GET  /api/orders/TEST        ->  403
GET  /                       ->  403 to any non-browser client
```

Paystack is a server and cannot solve a JavaScript challenge, so
`charge.success` never reaches the handler and the webhook — the intended
settlement path — is dead. **Money is still settling only because
`/api/orders/[reference]` lazily verifies with Paystack and calls the same
idempotent `mark_order_paid`**, and a returning buyer's real browser does solve
the challenge. Settlement therefore depends on the buyer coming back to their
ticket link. Pay-and-close-the-tab is the exposure.

**Fix, in the Vercel dashboard:** a firewall bypass rule for
`/api/webhooks/paystack` (preferred over switching challenge mode off — the
pages benefit from it). That endpoint does not need the firewall: it verifies
HMAC-SHA512 over the raw body before parsing, caps the body at 64 KB, and
rate-limits per IP.

This also means **`curl` cannot verify production from a terminal.** Checking a
deploy landed has to happen in a browser, or the check will report a 403 that
says nothing about the app.

### Reconciliation, 2026-08-23

`node scripts/reconcile.mjs` (needs the live Paystack key in `.env.local`,
which is now present) reports:

- **2026-08-21 → 2026-08-24: both sides agree, zero discrepancies.** 16
  successful Paystack transactions, 16 orders marked paid, identical amounts.
  Despite the dead webhook, nobody who paid is missing a ticket.
- Over the wider window two `MONEY TAKEN, NO TICKET` rows appear. Both are
  **pre-purge and already settled** — their emails are in
  `~/Documents/signout-backup-2026-08-20/orders.csv`, i.e. they are the two
  real live-mode purchases the 20 August purge deleted. Not a live problem.

Re-run it before the doors open. It is read-only.

### Deployments must be authored as FlagIQ

Vercel will not deploy a commit whose git author is not the project owner.
Commits authored `Mustang Akin <190403063@live.unilag.edu.ng>` push to GitHub
fine and then simply do not ship. The repo-local git identity is now set to
`FlagIQ <kevinaki2000@gmail.com>`, matching every commit AI Studio makes.
Check `git log --format='%an'` before wondering why production is stale.

### SALES ARE LIVE. DO NOT PURGE.

The link went out and a Twitter video did ~125k views. As of **2026-08-23** the
database holds real buyers: 252 orders, **24 paid**, 25 tickets (1 void), 0
check-ins.
The 2026-08-20 purge is history — a JSON + CSV snapshot of what that one
deleted is at `~/Documents/signout-backup-2026-08-20/`, outside the repo
because it is PII.

**`scripts/purge-test-data.mjs` is now a loaded gun and its safety is off.**
The `sk_live_` refusal reads `.env.local`, which still holds `sk_test_` while
the live key lives only in Vercel — so the guard **does not fire on this
machine** and the script will delete real paid orders without complaint. The
`--max 200` ceiling is the only thing left in the way, and the table is
already past it. Paste the live secret into `.env.local` to arm the guard.
`.gitignore` covers `.env*`.

Likewise **do not run `INTEGRATION_CAPACITY=1`** — it writes to the live
`event_settings` row. This is event week.

### What the traffic exposed

Conversion is ~10%: at one point 114 of 300 seats were held by 26 unpaid
checkouts. A pending order held its seats for 30 minutes, `maxPerOrder` is 5,
and one unverified phone could start 3 orders per 10 minutes — 15 seats. Twenty
invented numbers could have shown "sold out" to the whole audience for free.

Two layers were added in response, and they are not equally strong:

- **The database is the guarantee.** The hold window is **10 minutes**, and one
  phone may hold at most `maxPerOrder` seats unpaid at once (`phone_limit`, a
  third outcome from `create_pending_order` alongside `sales_closed` and
  `sold_out`). The interval is duplicated into `get_public_counter`; the two
  must always match or the page advertises seats checkout will refuse.
  `tests/migration-invariants.test.ts` pins both, offline.
- **The API limits only take the edge off.** They are per-instance memory that
  fails open on a cold start — see the note below.

**`DEVICE_ID_SECRET`** keys a signed httpOnly `sot_did` cookie
(`lib/api/device-id.ts`), stamped by middleware on `/` and `/checkout` only,
so checkout can rate-limit per device. The reason is CGNAT: Nigerian mobile
data egresses thousands of subscribers through a handful of addresses, so a
per-IP ceiling throttles the crowd while an abuser steps around it by toggling
airplane mode. A request with no valid cookie skipped the page, and shares a
stricter bucket. **Unset is safe** — everything falls back to the IP-only
behaviour that shipped before it.

**Still genuinely undone:**
- **No CSP.** Other security headers are set (`next.config.ts`). A real CSP
  needs per-request nonces stamped in middleware because Next inlines
  hydration scripts. Deliberately not shipped as `unsafe-inline` theatre.
- **Rate limiting is per-instance memory** (`lib/api/rate-limit.ts`) and fails
  open on a cold start. Accepted: the hard guarantees are in the database. Be
  aware Vercel will run several instances under a WhatsApp broadcast spike, so
  the effective limit is the configured one times the instance count. The
  device cookie improves the *keying*, not this — a cookie cannot make a
  per-instance counter global. Anything that must actually hold goes in a
  migration, not here.
- `npm audit` reports 3 high advisories in `sharp` (libvips), reachable only
  by upgrading to Next 16. Not exploitable here: `images.remotePatterns` is
  empty, so the only image sharp ever decodes is our own `public/assets/hero.jpg`.
  Re-evaluate after the event, not during it.
- **Refund policy is config-only.** `event.policies.refundPolicy` says "no
  refunds, no transfers, no resales" and that needs to be visible on the page
  before the first sale, not just in a file.
