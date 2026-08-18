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
no usable network, facing a queue of students, some of whom are presenting
WhatsApp screenshots of other people's QR codes.

Two audiences, two jobs:
1. **Students** — buy on a mid-tier Android phone on mobile data, from a link
   forwarded on WhatsApp. Must work on a slow connection and a small screen.
2. **Door staff** — scan, standing, one-handed, in a hurry, offline.
   **`/scan` is the highest-stakes surface in the app.** If it is slow, wrong,
   or ambiguous, the event fails in public. Budget accordingly.

The two defences against screenshot-sharing are non-negotiable: codes are
**single-use, first scan wins**, and the scan result always displays the
**holder's name and matric number** so staff can challenge identity. A green
tick alone is worthless.

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
  bodies with real queries; do not change the signatures.

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
- **Privacy:** the buyer list contains names, phone numbers, and matric numbers
  of ~400 identifiable students. It must be impossible to read any of it with
  the public anon key. RLS on every table, verified by an actual attack script.
  Before the sales link is distributed, append `&read_only=true` to the Supabase
  MCP URL in `.mcp.json`. From that point the buyer list is real student PII and
  no agent gets write access to it outside a reviewed migration.
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
UI complete from Google AI Studio. Handoff audit done, AI Studio scaffolding
stripped (no Gemini, no Express, no stray backend), and the Vite → Next.js 15
migration is complete: `npm run build` and `npm run lint` both pass clean, OG
tags are server-rendered, fonts are self-hosted via next/font, and the theme
is driven from `config/event.config.ts`.

All data is still mock, routed through `lib/data-access.ts`. No database, no
auth, no payments, no sync. 24 `TODO(handoff)` markers are the work queue —
`grep -rn "TODO(handoff)"`.

Known gaps worth naming:
- `/admin` and `/scan` have NO authentication. Any four digits at
  `/scan/login` opens the scanner.
- "Save Pass" on the ticket does not save anything; it shows a notice.
- `lib/mock-data.ts` still ships in the client bundle because
  `data-access.ts` imports it. It goes away in Session 1 Step 4.
- `assets/og.jpg` and `assets/logo.svg` are referenced by config but do not
  exist, so the WhatsApp preview has no image yet.
- `/scan` still uses `animate-pulse` / `animate-bounce` / `animate-ping`,
  which contradicts the "no animation on /scan" rule above. Left as-is
  because it is a design decision, not a defect — decide and apply.
