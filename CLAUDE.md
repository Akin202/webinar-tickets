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
- Supabase — Postgres, RLS, Realtime, Auth
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

## Current state
UI complete from Google AI Studio. Handoff audit done and the AI Studio
scaffolding stripped (no Gemini, no Express, no stray backend). Vite → Next.js
migration in progress. All data is mock, routed through `lib/data-access.ts`.
No database, no auth, no payments, no sync. Every gap is marked `TODO(handoff)`.
