# FlagIQ AI Summit '26 — ticketing

## What this is
Ticket sales and door check-in for **FlagIQ AI Summit '26**: 100 paid in-person
seats (₦10,000, all in) plus a free livestream. Saturday 3 October 2026, AI
UniPod, University of Lagos. Sales open 15 September 2026.

Forked from the sign-out after-party ticket app (August 2026), which took real
money in production. Checkout, webhook settlement, QR tickets, the offline
scanner, admin, email campaigns and RLS are inherited and proven. This repo
re-points that machine at a new event. **Nothing here may point at the
sign-out's Supabase project (`adbzxxzyqeurjfrrenme`), domain or buyer data.**

The build plan, with phases and decisions, is `summit-ticket-page-build-plan.md`.

## The real product
Two screens carry this build. The landing page is marketing; these are the product.
1. **Checkout.** Real money from real strangers, in a room of 100 people who
   know each other. Paid-but-no-ticket or ticket-but-not-paid is a public failure.
2. **The door scanner on 3 October.** Staff phones on bad venue wifi, a queue
   waiting. It must work offline and never admit a code twice.

Buyers are in Lagos on mid-tier Android phones on metered data. Support
arrives by WhatsApp, so surface the WhatsApp link wherever something can go wrong.

## Stack
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase
(Postgres, RLS, Auth) · Paystack (existing live business, webhook repointed) ·
Resend · Vercel

## Contracts — do not break these
- `types/ticketing.ts`: the data model; the schema must match it.
  `ATTENDEE_TYPES` and `TICKET_CODE_PREFIX`/`TICKET_CODE_PATTERN` are single
  definitions that the SQL is pinned to by `tests/migration-invariants.test.ts`.
- `config/event.config.ts`: every event-specific string, price, date, colour,
  speaker, programme slot and FAQ. Nothing event-specific in a component.
  Unfilled values are spelled `TODO(summit)` or `*.invalid`, and
  `tests/config.test.ts` fails while any survive. That test is the launch gate.
- `lib/data-access.ts`: the only seam between UI and data. Signatures are
  stable. One deliberate change so far: `initiatePurchase` gained
  `attendeeType` (2026-09-14).

## Hard rules
- **All money is integer kobo.** The client never decides an order is paid;
  only `mark_order_paid` does, via the webhook or the lazy verify on
  `/api/orders/[reference]`. Totals are computed server-side.
- **The `event_settings` row is what's enforced**, not config. Capacity, price
  and the sales hard stop live there; config only describes them, and the
  invariant tests compare the two.
- **Capacity counts minted tickets plus live pending holds**, inside
  `create_pending_order` under a row lock. The hold interval must match between
  that function and `get_public_counter`.
- **Livestream registrations never go in `orders`.** Capacity, `SalesSummary`,
  `reconcile.mjs`, CSV export and campaigns all sum `orders`, so free sign-ups
  there would eat seats. They get their own table.
- **Check-in is first scan wins**, one conditional UPDATE in `record_check_in`.
  Never read-then-write.
- **Door identity check: holder name + last 4 digits of the phone.** Door
  devices must not cache full numbers: `get_check_in_manifest` and
  `record_check_in` return only `holder_phone_last4` (2026-09-16).
- **RLS forced on every table**, all grants revoked from anon/authenticated.
  Ticket codes are generated in SQL from `gen_random_bytes`.
- **No refund copy, no waitlist, no manual bank-transfer entry.** Owner's call:
  when seat 100 sells, that is it.

## Design
- Public pages are a dark conference world (redesigned 2026-09-17, comp-led
  via Impeccable; DESIGN.md and `.impeccable/surfaces/` hold the system and
  the direction contract): deep navy ground `#081028`, one light top strip
  with the real stacked FlagIQ logo on a `#E9EDF2` chip, white Figtree 800
  headlines, Figtree body, JetBrains Mono only for times and money, signal red
  `#E3173E` only for primary actions and the 14:40 launch marker. Colours come
  from `brand` in config via `lib/theme.tsx` and the `--brand-*` tokens in
  `app/globals.css` (`brand.ink` is the TEXT colour, `brand.surface` the
  ground). Public roots carry `.public-page` so they use Figtree; `--font-body`
  stays Instrument Sans for the tools.
- The event page is split into `components/pages/event/` (top bar, hero, day
  preview, tickets, speakers, programme, reading sections) with styles in
  `components/pages/event-page.css` (`sp-` prefix) and the shared top bar in
  `event/top-bar.css`, which checkout and the ticket page also render.
- Figtree has no ₦ glyph: pages get it from the system font; the OG image
  loads Noto Sans from `assets/fonts/` as a fallback. Keep the OG image under
  300KB (currently ~48KB). Display apostrophes go through `typographic()`;
  config strings stay ASCII.
- `/admin` and `/scan` are tools with their own dense, high-contrast look
  (`--tool-*`, `--scan-*`). Do not restyle them toward the public page.
  Scanner result colours are fixed safety signals.
- Animate only `transform`/`opacity`, gated on reduced motion. `/scan` has no
  animation. The event page's one motion moment is the seat meter filling on
  scroll. Text contrast is at least 4.5:1 (white on the red button is 4.7:1),
  and scanner states must be distinguishable without colour.
- OG tags are server-rendered (WhatsApp's crawler runs no JS).

## Lessons inherited from the sign-out (each one cost something)
- **Vercel firewall:** Attack Challenge Mode over `/api/webhooks/paystack`
  silently kills settlement, because Paystack can't solve a JS challenge. Add a
  bypass rule for that path. `curl` can't verify production behind the challenge.
- **Vercel only deploys commits authored by the project owner.** Check
  `git log --format='%an'` before wondering why production is stale.
- **The Supabase MCP must be `read_only=true`** once real buyers exist.
  `.mcp.json` points at the Summit project (`tbnfykyrnkmtmwvuitcs`), currently
  read-write for pre-launch setup; append `&read_only=true` before sales open.
- **`scripts/purge-test-data.mjs` guards on `sk_live_` in `.env.local`.** Put the
  live key there, or the guard won't fire. Never purge after real sales start.
- **Never run `INTEGRATION_CAPACITY=1` after real sales start**; it writes the live
  `event_settings` row.
- **One lockfile: `bun.lock`.** Install with `bun install` (or `npx bun install`).
  Never commit a `package-lock.json`.
- **Work on `main`**, with no long-lived parallel branches.

## Commands
```bash
npm run dev
npm run build             # must pass before any commit
npm run lint              # tsc --noEmit
npm test                  # unit tests, no network
npx supabase link && npx supabase db push

node scripts/rls-attack.mjs        # anon + door-role attack script
node scripts/reconcile.mjs         # Paystack vs orders, both directions
node scripts/purge-test-data.mjs   # dry run; --confirm to clear (pre-launch only)
node scripts/seed-staff.mjs        # create an admin or door account
```

## Layout
```
app/                 App Router routes; thin server components.
components/pages/    Page bodies ("use client"), plus event-page.css.
components/          Presentational components.
lib/                 data-access (the seam), theme, offline-db, email, api/.
public/sw.js         The door scanner's offline shell.
supabase/migrations/ Seven inherited migrations + the Summit's own.
tests/               vitest. Integration tests are env-gated.
config/ types/       The contracts.
```
