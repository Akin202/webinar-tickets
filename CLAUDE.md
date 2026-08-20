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

**Everything on the nine-package finish plan is built except deployment.**
`npm run build`, `npm run lint` and `npm test` all pass clean. Zero
`TODO(handoff)` markers remain.

**The backend is live.** Supabase project `adbzxxzyqeurjfrrenme`, 5 migrations
applied, versions match the remote history. Six tables, RLS enabled and
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
1. **Nothing is deployed.** `lastdance.tickitid.online` has no DNS record at
   all — the apex is still Namecheap parking. No Vercel project, no env vars
   set there. That hostname is the Paystack callback, the WhatsApp OG card,
   every email link and the webhook endpoint, so nothing downstream of it can
   be tested. When setting env vars there, LEAVE `NEXT_PUBLIC_SITE_URL` UNSET
   rather than copying `.env.local` — that file says `localhost:3000`, and the
   config fallback (`eventConfig.seo.siteUrl`) is already correct.
2. **Still on Paystack test keys** (`sk_test_`). No live transaction has ever
   run end to end, so Part 2 check 1 of `signout-production-security.md` is
   unperformed.
3. **Resend is unverified.** `send.tickitid.online` has no DNS records, so the
   backup delivery channel does not work.
4. **Real-Android airplane-mode drill.** The offline shell is unproven on
   hardware — devtools offline mode is not the same thing.
5. **Section 5 of the attack script.** Unblocked now; needs a `DOOR_JWT`.

**The database holds test data.** Every row in `orders`, `tickets`,
`check_ins` and `settings_audit` was written by a test — the integration
suite's `INTEG-*` rows and manual purchases on test keys. Minted test tickets
hold seats against capacity and appear in the admin list and the CSV export.
`node scripts/purge-test-data.mjs` clears all four tables and re-asserts
capacity from the config; dry run is the default. **Run it as the last step
before the sales link goes out**, not before — testing between now and then
writes more rows. It refuses to run on a live Paystack key without an explicit
override, for the obvious reason.

**Still genuinely undone:**
- **No CSP.** Other security headers are set (`next.config.ts`). A real CSP
  needs per-request nonces stamped in middleware because Next inlines
  hydration scripts. Deliberately not shipped as `unsafe-inline` theatre.
- **Rate limiting is per-instance memory** (`lib/api/rate-limit.ts`) and fails
  open on a cold start. Accepted: the hard guarantees are in the database. Be
  aware Vercel will run several instances under a WhatsApp broadcast spike, so
  the effective limit is the configured one times the instance count.
- `npm audit` reports 3 high advisories in `sharp` (libvips), reachable only
  by upgrading to Next 16. Not exploitable here: `images.remotePatterns` is
  empty, so the only image sharp ever decodes is our own `public/assets/hero.jpg`.
  Re-evaluate after the event, not during it.
- **Refund policy is config-only.** `event.policies.refundPolicy` says "no
  refunds, no transfers, no resales" and that needs to be visible on the page
  before the first sale, not just in a file.
