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
  script. Before the sales link is distributed, append `&read_only=true` to the
  Supabase MCP URL in `.mcp.json`. From that point the buyer list is real PII
  and no agent gets write access to it outside a reviewed migration.
- **Link previews:** the URL is distributed on WhatsApp. OG tags must be in the
  server-rendered HTML — WhatsApp's crawler does not execute JavaScript.
- **Accessibility:** 4.5:1 minimum contrast. Scanner states must be
  distinguishable without colour.
- **Motion:** animate only `transform` and `opacity`, all wrapped in the
  reduced-motion check. `/scan` has no animation at all.

## Commands
```bash
npm run dev
npm run build          # must pass before any commit
npx supabase db push
```

## Layout
```
app/                 App Router routes. Thin server components that export
                     `metadata` and render a client component from
                     components/pages/.
components/pages/    The page bodies ("use client").
components/          Presentational components.
components/dev/      DevStateProvider — dev-only forced-state context.
lib/                 data-access (the seam), theme, offline-db, mock-data.
config/ types/       The contracts.
```

## Current state
UI complete. Vite → Next.js 15 migration done. `npm run build` and
`npm run lint` pass clean.

**The backend is live.** Supabase project `adbzxxzyqeurjfrrenme` has the
schema applied (3 migrations in `supabase/migrations/`, versions match the
remote history — `supabase db push` agrees with reality). Six tables, RLS
enabled and forced, all grants revoked from anon/authenticated. The only
anon-reachable surface is `get_public_counter()`, which returns counts and
no money.

Wired and verified against the live project:
- **Checkout** — `POST /api/checkout`. Amount computed server-side from
  config via `computeOrderTotals`; the client cannot send a price. Capacity
  and the sales gate are checked atomically inside `create_pending_order`
  (`FOR UPDATE` on the settings row). Rate-limited per IP and per phone.
  A live call returned a real Paystack authorization URL.
- **Payment** — `POST /api/webhooks/paystack` verifies the HMAC-SHA512
  signature against the raw body before parsing, then settles through
  `mark_order_paid`. That function is the single idempotent flip: verified
  create → paid → replay=already_paid → wrong-amount=no-op →
  unknown-ref=not_found, minting exactly the right number of tickets once.
  `/api/orders/[reference]` lazily verifies with Paystack and settles
  through the same function, so whichever path lands second is a no-op.
- **Door** — `record_check_in` decides first-scan-wins with one conditional
  UPDATE. Verified over real HTTP with a door JWT: admitted → already_used
  (carrying who and when) → not_found, with `admitted_count` staying 1.
- **Auth** — real. Six-digit gate PIN is the door terminal account's
  password; `/admin/login` is email+password with an admin role check.
  `middleware.ts` fronts both tools. Role is read from `staff_users`, never
  from JWT metadata. Create accounts with `node scripts/seed-staff.mjs`.
- **Admin API** — `/api/admin/*`, all behind `requireStaff`. CSV export
  writes an audit row naming who pulled it.

`node scripts/rls-attack.mjs` passes 16/16 against the live project,
including section 5 (door-role leakage) with a real door JWT: a door
account cannot read `orders` or `settings_audit` and cannot close sales,
and the manifest carries exactly its five permitted columns.

`lib/mock-data.ts` is gone — it was shipping 12 fake buyer records in the
production client bundle.

### What is left
- **No test suite.** Everything above was verified by hand against the live
  project. Nothing stops a regression.
- **Not deployed.** No Vercel project, no env vars set there, no webhook URL
  registered in the Paystack dashboard. Until that last step the webhook
  cannot fire.
- **No CSP.** Other security headers are set (see `next.config.ts`); a real
  CSP needs per-request nonces stamped in middleware because Next inlines
  hydration scripts. Deliberately not shipped as `unsafe-inline` theatre.
- **"Save Pass" still saves nothing** — it shows a "screenshot this" notice.
  This is the primary delivery path in practice, so it matters.
- **No email.** Resend is unwired; the admin resend button only toasts.
- **Offline not tested on real hardware.** The logic is fixed and the sync
  path is idempotent, but the airplane-mode requirement is unproven on an
  actual Android phone.
- Hero image is still a remote Unsplash URL on the LCP path.
- `.mcp.json` still needs `&read_only=true` appended before the sales link
  is distributed — from that point the buyer list is real PII.

3 `TODO(handoff)` markers remain — `grep -rn "TODO(handoff)"`.
