# Sign-Out Tickets — Finish-Line Plan (agent-executable)

## Context

Single-event ticketing platform for the UNILAG Faculty of Engineering sign-out
after-party. **Event: 2026-08-25 — six days from today (2026-08-19).** The
backend is live (Supabase `adbzxxzyqeurjfrrenme`, 3 migrations applied, RLS
deny-all verified by `scripts/rls-attack.mjs` 16/16), checkout → Paystack →
webhook → ticket minting → door check-in all wired and hand-verified.

A full end-to-end audit (two deep code sweeps + live-DB verification, 2026-08-19)
found that what remains is **not just the four documented gaps** (tests, deploy,
CSP, Save Pass / email). There are also **real correctness bugs** in the two
highest-stakes paths — the money path can oversell, and the offline scanner
both fails its airplane-mode requirement and has a first-scan-wins hole.

This plan is written so each work package can be executed by a **non-Fable
agent** (Sonnet/Haiku-class) with zero additional context: every package names
its files, exact changes, acceptance test, and guardrails. Packages have
disjoint file ownership so they can run in parallel sessions.

## Scope decisions (user-confirmed 2026-08-19)

- **Tests:** targeted regression suite only (money paths + door logic +
  rls-attack stays green). The global 80% TDD rule is deliberately overridden
  by the 6-day runway.
- **Email:** minimal Resend wiring — post-payment receipt with ticket link,
  fire-and-forget, never blocking the webhook; real admin resend button.
- **Deploy:** personal Vercel account, default `*.vercel.app` domain. No
  custom domain. **GitHub identity is `github-akin202` (FlagIQ's account),
  not `mustangakin`** — verified 2026-08-19 against the vault mapping, which
  records this as a deliberate exception for this repo despite it sitting
  under `Personal/Code`. Do not "correct" the remote.

## Verified current state (2026-08-19)

- Tree clean on `chore/handoff-cleanup-and-nextjs-migration`; typecheck passes.
- Live DB: 3 migrations applied (match local), 6 tables RLS-forced deny-all,
  `event_settings` seeded. **`staff_users` has 0 rows — no one can log in to
  /scan or /admin until `node scripts/seed-staff.mjs` is re-run.**
- `.env.local`: all 8 keys SET (Supabase ×3, Paystack ×2, Resend ×2, SITE_URL).
  `RESEND_*` and `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` are read by no code yet.
- Not deployed: no `.vercel/`, no CI, no `vercel.json`. `.mcp.json` still lacks
  `&read_only=true`.
- No test runner installed (`lint` = `tsc --noEmit`; no eslint, no vitest).
- **Two other interactive Claude sessions are open on this repo.** Every
  executing agent must re-check `git status` before starting and stage by
  explicit path — never `git add -A`.

## Audit findings — the punch list

Severity-ordered. FE = frontend audit, BE = backend audit; both from 2026-08-19.

**Critical (breaks a stated hard constraint):**
1. **`/scan` cannot load in airplane mode.** No service worker, no `public/`
   dir; the IndexedDB layer only helps if the tab is already open. A reload,
   tab eviction, or crash at the door locks the phone out for the night
   ([middleware.ts:39-50](middleware.ts#L39-L50) needs the network to answer).
2. **First-scan-wins hole across online→offline:** the online `admitted`
   branch never mirrors into IndexedDB
   ([ScanPage.tsx:222-232](components/pages/ScanPage.tsx#L222-L232)), so after
   losing signal the same QR admits a second person — exactly the
   screenshot-sharing attack the product exists to stop.
3. **Oversell + unrefundable money (BE BUG-1):** `create_pending_order` sweeps
   pending → abandoned at 30 min and releases capacity, but `mark_order_paid`
   flips `abandoned`/`failed` → paid and **mints with no capacity re-check**
   ([20260818234338_payment_and_staff_functions.sql:160-192](supabase/migrations/20260818234338_payment_and_staff_functions.sql#L160-L192)).
   Slow bank-transfer buyers get their seats resold, then their webhook mints anyway.
4. **Online scan has no timeout:** on captive/saturated Wi-Fi (`navigator.onLine`
   true, no uplink) the door hangs tens of seconds before falling back to cache
   ([ScanPage.tsx:220-236](components/pages/ScanPage.tsx#L220-L236)). Budget is 300ms.

**High:**
5. Comp-ticket reference is `Date.now().toString(36)` — an enumerable bearer
   token to `/ticket/[reference]`, and same-millisecond comps collide
   ([app/api/admin/comp/route.ts:35](app/api/admin/comp/route.ts#L35)).
6. Stale closures in the ZXing callback freeze `isOnline`/`staffUser`/count at
   camera start ([ScanPage.tsx:155-200](components/pages/ScanPage.tsx#L155-L200)).
7. Silent lost admission offline: cache is marked `checked_in` **before**
   enqueue, and enqueue swallows errors — guest admitted, server never told
   ([ScanPage.tsx:214-226](components/pages/ScanPage.tsx#L214-L226),
   [offline-db.ts:157-160](lib/offline-db.ts#L157-L160)).
8. No auto-sync on reconnect; no manifest re-download (late buyers are
   `not_found` offline).

**Medium — dishonest UI (real users get told falsehoods):**
9. Public page shows fabricated "214 claimed" before/if the counter RPC fails
   ([EventPage.tsx:252](components/pages/EventPage.tsx#L252), no `.catch`).
10. Sold-out waitlist form is 100% fake ([CheckoutPage.tsx:347-367](components/pages/CheckoutPage.tsx#L347-L367)).
11. "Confirmation sent to your email and WhatsApp" — no email exists
    ([CheckoutPage.tsx:286](components/pages/CheckoutPage.tsx#L286)).
12. Admin payment-channel chart is hardcoded mock percentages
    ([AdminPage.tsx:207-212](components/pages/AdminPage.tsx#L207-L212)); real
    `byChannel` is fetched and ignored.
13. Admin "resend" toasts success, sends nothing (TODO #3,
    [AdminPage.tsx:131-138](components/pages/AdminPage.tsx#L131-L138)).
14. "Save Pass" saves nothing (TODO #2, [TicketCard.tsx:296-308](components/TicketCard.tsx#L296-L308)).

**Medium — other:** CSV formula injection in export
([app/api/admin/export/route.ts:10-13](app/api/admin/export/route.ts#L10-L13));
rename endpoint has no paid-check/audit/cutoff; client-supplied `scanned_at`
accepted verbatim; admin routes have zero rate limiting (incl. the full-PII
export); no Origin check on cookie-authed POSTs; scanner offline double-scan
race; ZXing controls leak (camera stays on); admin sort is a no-op; unthrottled
admin search; manual-entry placeholder shows a format that can never validate
([ScanPage.tsx:502](components/pages/ScanPage.tsx#L502)).

**Accessibility/perf (against stated constraints):** hero is a remote Unsplash
CSS background — worst case for LCP (TODO #1); `not_found` icon uses the wrong
colour token (copy-paste, [ScanPage.tsx:595](components/pages/ScanPage.tsx#L595));
`not_found`/`voided` are near-identical at arm's length; full-screen white flash
on every scan violates "no animation on /scan" and photosensitivity;
`--brand-text-dim` ≈ 3.6:1 fails the 4.5:1 floor; no global
`prefers-reduced-motion` backstop; hardcoded `25/08` and calendar dates
([EventPage.tsx:191](components/pages/EventPage.tsx#L191),
[TicketCard.tsx:79](components/TicketCard.tsx#L79)).

**Working and verified (do not re-touch):** routing/metadata/OG (server-rendered,
incl. `app/opengraph-image.tsx`), auth (middleware `getUser()`, role from
`staff_users` never JWT), webhook HMAC-over-raw-body with `timingSafeEqual`,
`mark_order_paid` idempotency, `record_check_in` conditional-UPDATE
first-scan-wins, deny-all RLS, checkout rate limits, the money math in
`types/ticketing.ts`, dev-switcher dead-code elimination.

---

## Work packages

Global guardrails (every package, every agent) are in the section after these.

### WP-1 — Scanner correctness · **P0**
**Owns:** `components/pages/ScanPage.tsx`, `lib/offline-db.ts`,
`lib/scanner-feedback.ts`, scan tokens in `app/globals.css`.
**Suggested agent:** general-purpose (Sonnet) + `react-reviewer` pass after.

1. **Mirror every online `admitted` into IndexedDB** — call
   `updateCachedTicketStatus(code, 'checked_in')` in the online success branch.
2. **Reorder offline write:** `enqueueOfflineCheckIn` **first** (and make it
   throw instead of swallowing, [offline-db.ts:157-160](lib/offline-db.ts#L157-L160)),
   then `updateCachedTicketStatus`. If enqueue throws, show an explicit
   failure state — never a silent green.
3. **250ms deadline on the online path:** `Promise.race` the `checkInTicket`
   call against a timer; on timeout abort (AbortController) and fall through to
   the cache path. Idempotent `record_check_in` makes the late server reply safe.
4. **Kill the stale closures:** keep `isOnline`, `staffUser`, in-flight state
   in refs read at call time; use functional updaters for `admittedCount`
   (fixes the `:286` drift too).
5. **Per-code in-flight lock** (a `Set<string>` ref) so two rapid decodes of
   the same code can't both pass the `checked_in` check.
6. **Capture the ZXing `IScannerControls`** returned at
   [ScanPage.tsx:169](components/pages/ScanPage.tsx#L169) and stop it in
   cleanup, including the unmounted-before-resolve case.
7. **Auto-sync on reconnect:** the `online` listener triggers the same sync the
   button runs. Add a separate **manifest re-download** button (the current
   `RefreshCw` is sync, not refresh); re-download must not clobber locally
   `checked_in` rows — merge by keeping the stricter status.
8. Manual-entry placeholder → `e.g. SGN-7K2Q-9XM4` (must match
   [offline-db.ts:83](lib/offline-db.ts#L83)).
9. Re-read queue depth from IndexedDB on `visibilitychange`/`focus`.
10. **No animation on /scan:** remove the full-screen white flash
    ([:566-568](components/pages/ScanPage.tsx#L566-L568)) and
    `transition-all` on the overlay. Fix `not_found` icon token (`:595`), and
    give `voided` a visually distinct treatment from `not_found` (different
    icon + lighter/darker panel) so they differ at arm's length without colour.
11. Gate the "Haptics & Audio Active" label on actual
    `navigator.vibrate`/`AudioContext` presence.

**Accept:** with dev server running — scan online (admitted), toggle airplane
in devtools, re-scan same code → **already_used, not admitted**. Kill network
mid-scan → result within ~300ms via cache. Queue depth survives reload.
`npm run build` clean.

### WP-2 — Offline shell (service worker) · **P0**
**Owns:** `app/sw.ts`/`public/` (new), `app/layout.tsx` (SW registration only),
`next.config.ts` (plugin wiring only — coordinate with WP-7's hero edit).
**Suggested agent:** general-purpose (Sonnet); read Serwist docs via context7 first.

`/scan` must survive a reload in airplane mode. Use **`@serwist/next`** (the
maintained next-pwa successor):
- Precache/runtime-cache **only**: `/scan` document (network-first, cache
  fallback) and `/_next/static/*` (cache-first, immutable).
- **Explicitly never cache:** `/api/*`, `/ticket/*`, `/admin*`, `/`,
  Supabase origins. Deny-list in the runtime config, not by omission.
- Register the SW only on the `/scan` route (a tiny client component in the
  scan page shell), so the party page keeps zero SW complexity.
- When served from cache offline, the page's Supabase calls fail → the
  existing IndexedDB path takes over; middleware never runs because the
  request never leaves the device. Session cookie expiry: set Supabase
  session lifetime long enough to cover event night (check dashboard setting;
  document in the launch checklist).

**Accept:** `npm run build && npm run start`, log in, open `/scan`, load
manifest, enable airplane mode at OS level, **hard-reload → page renders and a
cached code scans to a result**. Verify `/`, `/ticket/*`, `/api/*` are not in
the SW cache (Application tab).

### WP-3 — Money-path + API hardening (migration 4) · **P0**
**Owns:** `supabase/migrations/` (new file only), `app/api/**`, `lib/api/**`,
`scripts/rls-attack.mjs` (extend only).
**Suggested agent:** general-purpose (Sonnet) + `database-reviewer`; load the
`supabase-postgres-best-practices` skill before writing SQL.

1. **Fix the oversell (BUG-1)** in a new migration
   (`202608XX_capacity_guard_on_late_payment.sql`), replacing
   `mark_order_paid`: when the claimed row's prior status was `abandoned` or
   `failed`, re-check capacity (same count as `create_pending_order`, under
   `FOR UPDATE` on the settings row) **before minting**. If full: still mark
   the order `paid` (the money is real), mint **zero** tickets, return a new
   outcome `'paid_no_capacity'`, and write an audit row. Webhook/verify route
   surface this outcome distinctly (log at error level). Admin sees these
   orders (status paid, 0 tickets) for a manual refund — with a 10% capacity
   buffer this path should never fire; it exists so its firing is loud, not silent.
2. **Comp references (BUG-2):** extract `generateReference()` from
   [checkout/route.ts:22-28](app/api/checkout/route.ts#L22-L28) into
   `lib/api/reference.ts`; use it in both checkout and comp. Fix the modulo
   bias while there (rejection sampling).
3. **CSV injection (BUG-3):** in `csvField`, prefix `'` to any field starting
   with `=`, `+`, `-`, `@`, tab, or CR.
4. **Rename hardening (BUG-6):** require the parent order `status = 'paid'`,
   reject after `doorsOpenIso`, write an audit row (reuse the void/export audit
   mechanism found in [app/api/admin/void/route.ts:42-47](app/api/admin/void/route.ts#L42-L47)).
5. **Admin rate limits (BUG-8):** apply the existing `lib/api/rate-limit.ts`
   to all `/api/admin/*` (generous, e.g. 60/min) and a tight one on `export`
   (5/min). Fix eviction to TTL-sweep expired entries first.
6. **Origin check (BUG-7):** small helper `assertSameOrigin(req)` used by all
   cookie-authenticated POSTs; reject mismatched `Origin` with 403.
7. **Clamp `p_scanned_at` (BUG-5)** in the same migration: reject/clamp future
   timestamps (`least(p_scanned_at, now())`).
8. Extend `rls-attack.mjs`: assert the two money functions are not executable
   by anon/authenticated (service-role-only grants), and assert `set_sales_open`
   still fails for the door role after the migration.

**Accept:** migration applies via `supabase db push` with zero drift; `node
scripts/rls-attack.mjs` passes all sections (with `DOOR_JWT`);
`get_advisors(security)` shows no new WARNs beyond the known-intentional set;
manual curl of comp endpoint twice in quick succession → two distinct
unguessable references.

### WP-4 — Honest UI + a11y floor · **P1**
**Owns:** `components/pages/EventPage.tsx`, `components/pages/CheckoutPage.tsx`,
`components/pages/AdminPage.tsx` (except `handleResend` — WP-6 owns that),
`components/TicketCard.tsx` (except the Save Pass handler — WP-5),
`components/StatusBadge.tsx`, `app/globals.css` (brand tokens), small components.
**Suggested agent:** general-purpose (Sonnet or Haiku) + `react-reviewer`.

1. Sold counter: no fabricated fallback — skeleton/"—" until
   `getPublicSalesCounter` resolves; add `.catch` that hides the meter
   (`showLiveSalesCounter` semantics) rather than lying.
2. Remove the fake waitlist form entirely; sold-out state offers the WhatsApp
   support button ("message us — we'll tell you if spots open").
3. Success copy: remove "email and WhatsApp" claim; say "Save your pass below —
   your ticket link also works anytime." (WP-6 may restore an email mention
   once real.)
4. Channel chart: render from `summary.byChannel`; delete the mock object.
5. Admin table: client-side sort of the fetched page (make headers real
   `<button>`s with `aria-sort`); debounce search 300ms with a request-sequence
   guard; stop re-fetching all tickets on row expand (reuse state); guard
   `capacity === 0` division.
6. Config-derive the hardcoded `25/08` and the calendar URL dates (from
   `doorsOpenIso`/`endsAt` — [TicketCard.tsx:79](components/TicketCard.tsx#L79)).
7. TicketCard: restore the holder-phone row (it's the number staff will
   challenge — the holder must see it).
8. Delete orphaned `StatusBadge.tsx`; remove unused imports/vars flagged in the
   audit; add `'use client'` to `CapacityMeter`, `WhatsAppSupportButton`,
   `hooks/useReducedMotion.ts`.
9. Contrast: raise `--brand-text-dim` mix until ≥ 4.5:1 on `--brand-surface`
   (compute, don't eyeball); footer `text-slate-500` → 400; darken
   `--scan-unpaid` to clear 4.5:1 with white.
10. Add a global `@media (prefers-reduced-motion: reduce)` backstop in
    `globals.css` (kill `animation`/`transition` durations) and gate the two
    remaining ungated `animate-pulse` uses.
11. Modals: Escape-to-close + focus the primary control on open (skip full
    focus-trap; note as post-event debt).
12. Delete dead config keys `brand.logoUrl`/`brand.ogImageUrl` +
    `featureFlags.offlineScannerEnabled`, with a one-line comment in the
    commit message (config contract change, deliberate).

**Accept:** `npm run build` clean; no string from `event.config.ts` duplicated
in any component (grep for `25/08`, `20260825`); channel chart totals equal
`ticketsSold`; axe devtools on `/` and `/checkout` → no critical issues.

### WP-5 — Save Pass PNG export · **P1**
**Owns:** the Save Pass handler + a new `lib/pass-export.ts`.
**Suggested agent:** general-purpose (Sonnet).

Primary delivery path in practice. No new heavy dependency (no html2canvas):
1. Switch `QRCodeSVG` to `marginSize={4}` (drop deprecated
   `includeMargin` — quiet zone must live **inside** the SVG so the export
   can't crop it).
2. `lib/pass-export.ts`: draw a dedicated export canvas — white background,
   QR serialised from the live SVG (`XMLSerializer` → `Image` → `drawImage`)
   at ≥512px, then holder name, formatted phone, ticket code (monospace,
   large), event name/date/venue from config, "one entry only" line.
   `canvas.toBlob('image/png')` → object-URL anchor download
   (`sgn-pass-<code>.png`). If `navigator.canShare({files})`, offer Web Share
   ("Send on WhatsApp") as the primary button, download as secondary.
3. Replace the "screenshot saved tip" notice with truthful copy tied to what
   actually happened (downloaded / shared / failed + screenshot fallback).

**Accept:** in Chrome device-mode and on one real Android: tap Save →
file lands in Downloads; open the PNG full-screen and scan it with a second
phone's camera → decodes to the exact ticket code. QR in the PNG has a visible
white margin.

### WP-6 — Minimal email (Resend) · **P1** · after WP-4 merges (shared file: AdminPage)
**Owns:** `lib/email.ts` (new), `app/api/admin/resend/route.ts` (new),
`app/api/webhooks/paystack/route.ts` + `app/api/orders/[reference]/route.ts`
(send-hook lines only), `AdminPage.tsx` `handleResend` only.
**Suggested agent:** general-purpose (Sonnet).

1. `lib/email.ts`: plain `fetch` to `https://api.resend.com/emails` (no SDK
   dependency); reads `RESEND_API_KEY`/`RESEND_FROM_EMAIL`; exports
   `sendTicketEmail(order, ticketUrl)`. Template: table-layout, inline-styled,
   <100KB, no images — event details + big link to `/ticket/[reference]` +
   WhatsApp support link. Gmail-on-Android is the target renderer.
2. Fire on the **transition to paid only** (webhook and lazy-verify both learn
   the outcome from `mark_order_paid`; send only when outcome === `'paid'`).
   `void`-and-forget with `.catch(console.error)` — a send failure must never
   affect the response. Do not await it in the webhook handler.
3. `POST /api/admin/resend`: `requireStaff('admin')`, `assertSameOrigin`,
   rate-limit 10/min, audit row (same mechanism as void/export), then
   `sendTicketEmail`. Wire `handleResend` to it; toast reflects the actual
   response; button disabled in flight. Delete TODO #3.
4. WP-4's success copy may now mention email again — one line, accurate.

**Accept:** with a test order in the DB (use Paystack test mode or a manually
inserted paid order): admin resend delivers to a real inbox; webhook path
verified by log line; killing `RESEND_API_KEY` makes sends fail loudly in logs
while checkout/webhook behaviour is unchanged.

### WP-7 — LCP hero + perf trims · **P1**
**Owns:** `components/pages/EventPage.tsx` hero block, `app/layout.tsx` fonts,
`next.config.ts` images block, `public/assets/` (new), `config/event.config.ts`
`heroImageUrl` value, ScanPage's zxing import line (coordinate with WP-1 —
land after it).
**Suggested agent:** general-purpose (Sonnet); `performance-optimizer` to verify.

1. Download the current Unsplash hero once, encode AVIF (+WebP fallback) at
   ~828w and ~1600w, each **< 150KB**, into `public/assets/`. Point
   `eventConfig.brand.heroImageUrl` at the local path.
2. Convert the CSS-background hero
   ([EventPage.tsx:115-121](components/pages/EventPage.tsx#L115-L121)) to
   `next/image` `fill` + `priority` + `sizes="100vw"` under the existing
   overlay — this is what makes the LCP image preload-discoverable;
   self-hosting alone does not.
3. Delete the now-dead `images.remotePatterns` entry and TODO #1 in
   `next.config.ts`.
4. Fonts: give Plus Jakarta Sans an explicit `weight` array of only the used
   weights (grep usage); leave the other two families.
5. Dynamically import `@zxing/browser` inside the camera effect (or
   `next/dynamic`) so the `/scan` shell paints before the decoder loads.

**Accept:** `npm run build`; Lighthouse mobile on `/` (throttled Slow 4G, 4x
CPU): **LCP < 2.5s**, CLS < 0.1; report the actual numbers in the commit/PR
body. Hero requests hit same-origin only.

### WP-8 — Regression suite · **P1** (parallel-safe: only new files + package.json)
**Owns:** `vitest.config.ts`, `tests/**` (new), `package.json` scripts.
**Suggested agent:** general-purpose (Sonnet); `pr-test-analyzer` to review.

Install `vitest` (devDependency) — no jsdom needed; these are node tests.
1. **Money math:** implement the 420-case sweep the comment in
   [types/ticketing.ts:216-218](types/ticketing.ts#L216-L218) claims — for
   quantity 1–5 × price grid × `passFeeToBuyer` both ways: parts sum to total,
   all integers, gross-up identity `net(total) ≥ subtotal`, `paystackFeeKobo`
   bracket edges (₦2,500 boundary, ₦2,000 cap).
2. **Phone + code parsing:** `normaliseNgPhone` table (0-prefix, 234, 10-digit,
   garbage), `extractTicketCode` fail-closed cases (WhatsApp text wrapping a
   code, lookalike chars, empty).
3. **CSV guard:** `csvField` neutralises `= + - @` and quotes correctly
   (export the helper from the route file to make it importable).
4. **Webhook signature:** unit-test the HMAC gate by invoking the route
   handler with crafted `Request`s (valid sig over raw body, tampered body,
   missing header) with the Supabase admin client mocked at module boundary —
   assert only the valid one reaches the RPC.
5. **Door race (integration, env-gated `INTEGRATION=1`):** seed one
   paid order + ticket via service role, fire two concurrent
   `record_check_in` RPCs, assert exactly one `admitted` and one
   `already_used`, then delete the seeded rows. Skips (with a loud notice)
   when the env flag is absent.
6. `package.json`: `"test": "vitest run"`, `"test:security": "node
   scripts/rls-attack.mjs"`. Do not wire tests into `build`.

**Accept:** `npm test` green locally; the integration test proven once against
the live (still-empty) DB and cleaned up after itself.

### WP-9 — Deploy, CSP, launch ops · **P0 for deploy, staged**
**Owns:** Vercel project, env vars, `middleware.ts` (CSP nonce stamping),
`next.config.ts` (CSP header only), `.mcp.json` (final step only).
**Suggested agent:** `vercel:deployment-expert` for the deploy;
general-purpose for CSP.

1. **Deploy (day 4 at the latest):** create the Vercel project on the personal
   account. The repo remote is `git@github-akin202:Akin202/signout-tickets.git`
   — that is correct and deliberate; verify with `git remote -v` but do not
   repoint it. Set all 8 env vars
   for Production (values from `.env.local`; update `NEXT_PUBLIC_SITE_URL` to
   the assigned `*.vercel.app` URL). Deploy preview → verify → promote.
2. **Paystack webhook (user action):** register
   `https://<app>.vercel.app/api/webhooks/paystack` in the Paystack dashboard
   (live mode). The agent cannot do this — flag it and verify afterwards with
   a real ₦100-class test charge end-to-end, then Paystack's webhook replay ×5
   → still exactly the right number of tickets.
3. **CSP, staged:** middleware stamps a per-request nonce; start
   `Content-Security-Policy-Report-Only` (script-src 'self' 'nonce-…';
   connect-src 'self' + the Supabase project origin; frame-ancestors 'none';
   object-src 'none'; base-uri 'self'). Watch a day of reports; flip to
   enforcing only if clean **and before the sales link goes out** — otherwise
   ship report-only and record the decision. Never ship `unsafe-inline`
   theatre.
4. **Launch checklist (ordered):**
   - [ ] `node scripts/seed-staff.mjs` — admin + door accounts (staff_users is
         currently **empty**); confirm both logins on the deployed URL
   - [ ] `node scripts/rls-attack.mjs` with `DOOR_JWT` against production env
   - [ ] Supabase Auth session lifetime covers event night (door phones must
         not be logged out mid-event)
   - [ ] WhatsApp link-preview test: send the prod URL to yourself
   - [ ] Real-Android airplane-mode drill: login → load manifest → airplane →
         reload → scan → result (WP-2's acceptance, on hardware)
   - [ ] Two phones race the same code online → exactly one ADMITTED
   - [ ] Arm's-length test at 30% brightness on every scanner state
   - [ ] Soft launch: sell ~10 real tickets to the exec team at real price
   - [ ] Append `&read_only=true` to the Supabase URL in `.mcp.json`, commit —
         **after this, no agent writes to the DB outside a reviewed migration**
   - [ ] Distribute the sales link
   - [ ] Event morning: load manifest on every door phone, brief staff on the
         ALREADY SCANNED screen (name + first-scan time is their evidence)

---

## Global guardrails — every executing agent, every package

1. **Contracts are law.** `types/ticketing.ts` changes require a migration in
   the same commit; `config/event.config.ts` values never hardcoded into
   components; `lib/data-access.ts` signatures frozen.
2. **Money is integer kobo.** The client never decides payment status; only
   `mark_order_paid` flips it.
3. **Before starting:** `git status` — two other sessions work this repo.
   Stage by explicit path; never `git add -A`. Commit format
   `<type>: <description>`, no attribution footer.
4. **Before finishing:** `npm run build` and `npm run lint` clean;
   `node scripts/rls-attack.mjs` after any migration or API change; after any
   migration also check `get_advisors(security)` via the Supabase MCP.
5. **Migrations:** new timestamped file per change; never edit an applied one;
   `supabase db push` must agree with the remote history.
6. **/scan rules:** no animation, no colour-only state distinction, nothing
   that adds latency to scan-to-result (300ms budget).
7. **Design language:** `/` is a party; `/admin` and `/scan` are tools. Don't
   cross-pollinate.
8. **Don't touch:** the verified-working list in the audit section;
   `.mcp.json` (until the launch-checklist step); other packages' owned files.

## Sequencing (6 days)

| Day | Packages | Note |
|---|---|---|
| 1 (Aug 19) | WP-1 + WP-3 in parallel (disjoint files), WP-4 start | The two P0 correctness packages first |
| 2 (Aug 20) | WP-2, WP-5, WP-4 finish | SW lands after WP-1 so scan logic is stable |
| 3 (Aug 21) | WP-6, WP-7, WP-8 in parallel | WP-6 waits for WP-4's AdminPage merge |
| 4 (Aug 22) | WP-9 deploy + webhook + soft launch to exec team | Sales link can go out end of day |
| 5 (Aug 23) | Hardware QA drill, CSP decision, fixes | Real Android, airplane mode, two-door race |
| 6 (Aug 24) | Buffer + staff briefing + manifest drill | Event is the 25th |

Anything not in a package (EventPage→RSC split, focus traps, IndexedDB
migration path, admin-shell role gate) is **named, deliberate post-event debt**
— do not let an agent "helpfully" pick it up this week.

## Verification (end-to-end, after all packages)

The manual QA table in `signout-tickets-build-plan.md` §9 remains the master
list. The five that prove this plan specifically: webhook replay ×5 (exactly N
tickets), screenshot attack (ALREADY SCANNED + first-scan evidence), airplane
reload-and-scan on hardware, two-door race (one ADMITTED), and LCP < 2.5s on
throttled mobile with the self-hosted hero.
