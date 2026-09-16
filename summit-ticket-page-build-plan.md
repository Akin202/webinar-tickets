# FlagIQ AI Summit '26 — turning the sign-out fork into the Summit ticket app

## Context

`webinar-tickets` is a fork of the finished, battle-tested sign-out ticket app: Paystack checkout + webhook, QR tickets, offline door scanner, admin, email campaigns, RLS, all proven with real money. The Summit (100 paid seats + free livestream, Sat 3 Oct 2026, AI UniPod UNILAG; sales open **15 Sept**) needs that same machine with a different event on top.

`summit-ticket-page-build-plan.md` was written as if **no app existed** ("bare create-next-app scaffold"). That is wrong for this repo, so most of its Phase A/B/C is already built. The job is **isolate → re-contract → reskin → add livestream**, not build from scratch. The design source is the artifact `3c802817…` (light editorial: paper `#F5F4F0`, ink `#030617`, Flag Red `#CA3A32`; Fraunces / Instrument Sans / JetBrains Mono).

### Decisions already made (by you)
- **Paystack:** reuse the existing live business and repoint its webhook to the Summit domain. Real in-app checkout goes live on 15 Sept, with no hosted-page stopgap.
- **Door check:** the scan result shows **name + last 4 digits** of the phone. Door devices never cache full numbers.
- **Livestream:** in-app registration, stored in its own table. No payment, no QR, doesn't touch the 100 seats.
- **No refund copy, no waitlist, no manual bank-transfer entry.** When seat 100 sells, that's it.
- **"Send someone in your place":** this already exists as ticket renaming. From their ticket link, the buyer changes the name printed on the ticket, and the QR stays the same. The phone on the ticket stays the buyer's. It will **not** be advertised in the FAQ. Keep `allowNameChange: true` (zero work), or flip it to `false` if tickets should be strictly non-transferable.

### Deviations from the old build plan (and why)
| Old plan said | Revised | Why |
|---|---|---|
| `TicketType` on Order + Ticket, capacity filtered by type | Separate `livestream_registrations` table; Order/Ticket unchanged | Capacity, `SalesSummary`, `reconcile.mjs`, CSV export and campaigns all sum `orders`. One missed `ticket_type` filter means free sign-ups eat seats. A separate table needs zero filters. |
| Rename `event.config.ts` → `summit.config.ts` | Keep the filename | 31 importers, and the generic name *is* the reuse story |
| `formatTicketCode()` / `isValidTicketCodeShape()` | Real SGN sites: 2 SQL migrations (check constraint + generator), `lib/offline-db.ts:137`, `ScanPage.tsx:838`, tests | Those functions don't exist here |
| Matric → attendee type | Just **add** `AttendeeType` | Matric was already removed |
| "Door staff never get contact details" | Last 4 digits only | Your call: a compromise that keeps the screenshot defence |
| Next 16, Phase A hosted Payment Page | Next 15 as-is, real checkout day one | The app already works; a stopgap would create an import job later |

---

## Phase 0 — Isolate from the sign-out (tonight, BLOCKING everything else)

The fork still points at the sign-out's live systems. Nothing gets run until these are done.

**You (dashboards):**
1. **New Supabase project.** Never the sign-out's `adbzxxzyqeurjfrrenme`, which holds real PII.
2. **Paystack:** before repointing, run `node scripts/reconcile.mjs` **in the sign-out repo** one last time. Then set the business webhook URL to `https://<summit-domain>/api/webhooks/paystack`.
3. **Domain:** pick the Summit subdomain. On Vercel, **do not** put Attack Challenge Mode on `/api/webhooks/paystack` (that's the sign-out's lesson), or add a bypass rule.
4. **Resend sending domain:** reuse the verified `send.tickitid.online` (fastest), or verify a FlagIQ domain (takes hours). Your call tonight.
5. **Vercel project:** new project. Commits must be authored as the Vercel project owner (the sign-out's deploy lesson).
6. **GitHub identity:** the remote is `github-mustangakin/webinar-tickets`. Summit is FlagIQ work, which maps to `github-akin202` per the account rules. Confirm against `~/SecondBrain/02-Areas/github-accounts.md` before the first push.

**Agent (repo):**
- `.mcp.json` → new `project_ref`, and **keep `read_only=true`**. Update `project_id` in `supabase/config.toml` and the `name` in `package.json`.
- `.env.example` → strip sign-out commentary and domains. Fresh `DEVICE_ID_SECRET` and `EMAIL_UNSUBSCRIBE_SECRET`. The live Paystack key goes in `.env.local` so the purge guard is armed.
- Rename the IndexedDB names in `lib/offline-db.ts:27-28` (`signout_*` → `summit_*`) and the CSV filename in `AdminPage.tsx:361`.
- Rewrite `CLAUDE.md` for the Summit, using old plan §5 as the base. Correct it for: Next 15, bun.lock, last-4 door rule, separate livestream table, existing commands and scripts. Delete `signout-production-security.md` and the empty `ticket-page-build-plan.md`. Replace `summit-ticket-page-build-plan.md` with this revised plan.
- Verify the webhook handler **no-ops with a 200 on unknown references**, because late sign-out events will now land on the Summit endpoint.

---

## Phase 1 — Launch-critical (tonight → 15 Sept morning)

### 1a. Config — `config/event.config.ts`
- Event: name, tagline, host FlagIQ, date `2026-10-03`, doors `10:00`, ends `16:00`, venue AI UniPod UNILAG + map URL, Summit support WhatsApp. Remove `dressCode`, `ageOrIdPolicy` and `refundPolicy`.
- Ticketing: `priceKobo: 1_000_000`, `capacity: 100`, `maxPerOrder: 5`, **`passFeeToBuyer: false`, `serviceChargeRate: 0`** ("₦10,000 all in"). `salesHardStopAt` defaults to `2026-10-02T23:59:00+01:00`; confirm.
- New typed arrays, so page copy stops living in JSX:
  - `speakers[]` `{id, name, role, photoUrl|null}`
  - `programme[]` `{time, title, durationMins, speakerId?, isBreak?}`
  - `audiences[]` (the "Who it's for" section)
  - `seatIncludes[]`, `livestreamIncludes[]`
  - `faq[]` (bank transfer via Paystack checkout, what ₦10k gets you, livestream is free, "100 seats, no waitlist")
  - `livestream: {enabled, streamUrl}`
- `brand` → Summit palette and the three fonts. `staff.scannerEmail` goes on the Summit domain and is final **before** `seed-staff.mjs` runs. `seo` and `legal` fields are FlagIQ-owned.
- **New test** `tests/config.test.ts`: fails on any `TODO`, `lastdance`, `tickitid` (unless you choose that Resend domain), `sign-out` or `SGN` string in config. This is the build-time guard the old plan wanted from `assertConfigComplete()`.

### 1b. Contracts — `types/ticketing.ts` + `lib/data-access.ts`
- Add `export type AttendeeType = 'student' | 'professional' | 'founder'`. Add a required `attendeeType` to `Order` and `CheckoutValues`.
- Change the example code in comments to `FIQ-XXXX-XXXX`, and export a single `TICKET_CODE_PATTERN` so `offline-db.ts` stops carrying its own copy.
- Leave `initiatePurchase` alone apart from the new field. Document the signature change the way the matric removal was documented.

### 1c. Migrations — fresh project gets the 7 existing ones as-is, plus:
- `…_summit_ticket_codes.sql`: swap the tickets check constraint and the code generator from `SGN-` to `FIQ-`. There are two generator definitions; replace the latest.
- `…_attendee_type.sql`: an `attendee_type` enum, a not-null column on `orders`, and `create_pending_order` gains `p_attendee_type` (also update the comp route's call). Seed `event_settings`: price 1,000,000, capacity 100, hard stop. Remember the rule that the hold interval must match between `create_pending_order` and `get_public_counter`; `tests/migration-invariants.test.ts` pins it.

### 1d. Checkout — `app/api/checkout/route.ts`, `components/CheckoutForm.tsx`, `CheckoutPage.tsx`
- Add `attendeeType: z.enum([...])` to the zod schema and pass it to the RPC. Add a required select to the form. Remove the "Get Your Sign-Out Ticket" copy.

### 1e. Public reskin — the artifact becomes React (admin and `/scan` untouched)
- `app/layout.tsx`: switch next/font to Fraunces (900 only) + Instrument Sans + JetBrains Mono (500/700, subset latin), replacing Bricolage/Inter.
- `components/pages/EventPage.tsx`: rebuild from the artifact's sections: masthead, hero + facts, two ways in (seat card with the existing `CapacityMeter`/`QuantityStepper`/`computeOrderTotals`; livestream card), speakers (initials placeholder when `photoUrl` is null), programme (ink band), audiences, FAQ, closer, footer.
  - **Every string from config.** Drop the artifact's `.spec` build notes. Motion is transform/opacity only, inside the reduced-motion check.
  - The seat button → the existing `/checkout?qty=`. The livestream button → the Phase 2 form, or "Registration opens this week" if it isn't ready. Never a dead link.
- Restyle `CheckoutPage`, `TicketPage`, `TicketCard`, `lib/pass-export.ts`, `app/opengraph-image.tsx` (≤300KB, check the byte size), `lib/email.ts` ticket email copy, and `not-found`/`error`/`cookies`/`unsubscribe` to the Summit look.
- `grep -rniE "sign-?out|after-?party|last dance|byob|faculty"` over `app components lib` must return only `supabase.auth.signOut`.

### 1f. Go-live gate (15 Sept)
`bun install && npm run build && npm run lint && npm test` clean → `supabase link && npx supabase db push` → `node scripts/rls-attack.mjs` 13/13 against the new project → `seed-staff.mjs` (admin + door) → deploy → in admin set the price to ₦100, make a real live-card purchase, receive the QR email, see the order paid **via the webhook** (not only the lazy verify), set the price back to ₦10,000 → run `purge-test-data.mjs --confirm` **only now, before real sales** → send the WhatsApp link preview to yourself → open it on a cheap Android on mobile data at 360px.

---

## Phase 2 — Livestream (16–21 Sept)

- Types: `LivestreamRegistration {id, name, email, phone, attendeeType, marketingOptIn, createdAt}`.
- Migration: a `livestream_registrations` table with a **unique email**. RLS forced, grants revoked from anon/authenticated. A service-role-only `register_livestream()` that is idempotent: a repeat email returns `already_registered`, not an error. Extend the `email_campaign_audience` enum with `livestream` (enum at `20260826001100…sql:13`, zod at `app/api/admin/campaigns/route.ts:10`).
- `POST /api/livestream`: same body cap, zod, device/IP/phone rate limits as checkout. Confirmation email via Resend with no QR and no stream link yet. `data-access.ts` gets a `registerLivestream()`.
- Admin: a livestream count on the summary, a list + CSV tab, and the "livestream" audience in campaigns. Stream-link sends (the day before, and an hour before) are manual campaigns from admin; no scheduler.
- Add a section to `rls-attack.mjs`: anon cannot read `livestream_registrations`.

## Phase 3 — Door (22–29 Sept)

- Migration: `get_check_in_manifest` and `record_check_in` return `right(holder_phone, 4)` as `holder_phone_last4`, never the full number. Admin ticket search keeps the full phone.
- Types: add a door-facing `DoorTicket` (Ticket minus `holderPhone`, plus `holderPhoneLast4`) used by `CheckInResult` and the manifest. This is a deliberate contract change, noted in CLAUDE.md.
- `lib/offline-db.ts`: bump the IndexedDB version so a cached full-phone manifest is dropped. `ScanPage.tsx:987-1010` shows "•••• 6789" with the prompt "Ask: last 4 digits of your number?".
- `migration-invariants.test.ts`: assert that neither door RPC returns the full `holder_phone`.
- Run `rls-attack.mjs` section 5 with `DOOR_JWT`. Integration tests against the new project (the capacity race is safe **only before** real sales, so run it in Phase 1 or never). Real-Android airplane-mode drill after the final deploy. Two phones scanning the same code: exactly one admits.

---

## Verification (end to end)
- `npm run build`, `npm run lint`, `npm test`, all green. New tests: config guard, attendee type in the checkout schema, FIQ code parsing, last-4 invariants.
- `node scripts/rls-attack.mjs` fully green on the new project, including the livestream table and section 5.
- Live ₦100 purchase → webhook-settled → QR email in Gmail on Android → scan online → admitted → second scan rejected.
- Livestream registration → no charge, no QR, a repeat email is idempotent, seat counter unchanged.
- Airplane-mode scan on real hardware shows name + last 4 digits.
- WhatsApp preview renders title, description and image. Public page LCP < 2.5s on Slow 4G.

## Inputs still needed from you
Summit domain · Resend domain choice · Supabase project ref · Summit WhatsApp number · sales close time (default 2 Oct 23:59) · speaker bios/photos (initials until then) · stream URL (by 2 Oct) · confirm the GitHub/Vercel account.
