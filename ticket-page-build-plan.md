# FlagIQ AI Summit '26 — Ticket Page Build Plan

*Written 14 September 2026 · Tickets open Monday 15 September · Event Saturday 3 October*

---

## 1. What the audit found

You asked whether to reskin your existing ticketing app or rebuild. Neither, as it turns out — **there is no existing app.**

| Folder | What's actually in it |
|---|---|
| `Work/signout-tickets-app` | A `create-next-app` scaffold. Two commits. Next 16.3.1, React 19, Tailwind v4. The default starter page. A half-filled `config/event.config.ts`. Dependencies: `next`, `react`, `react-dom` — nothing else. |
| `Work/signout-tickets` | No app. The **contracts layer only**: `types/ticketing.ts`, `lib/data-access.ts`, `lib/mock-data.ts`, `config/event.config.ts`. Every data-access body returns mock data behind a `TODO(handoff)`. |

You ran software-composer through Phase 3 in August for the sign-out party, wrote the contracts, and stopped. There is no Supabase, no Paystack, no QR generation, no email, no scanner, no admin.

**Why this is better news than it sounds.** The contracts are the part that's expensive to get right and catastrophic to get wrong, and yours are good:

- All money is integer kobo. No floats anywhere.
- `paystackFeeKobo()` implements Nigerian local-card pricing — 1.5% + ₦100, waived under ₦2,500, capped at ₦2,000.
- `normaliseNgPhone()` handles every way a Nigerian types their number.
- Ticket codes use an unambiguous alphabet with no `0/O/1/I/L`, because codes get read aloud over the phone.
- Check-in is specified as **first scan wins** via conditional update, with an explicit warning not to read-then-write because two doors will race.
- The offline door manifest deliberately excludes buyer phone numbers so door staff can't walk off with the contact list.

That's a foundation most people don't have on day one. You're not starting from zero — you're starting from the best place to start.

---

## 2. The decision that makes tomorrow possible

The 15 September deadline is **not** a deadline for a ticketing system. It's a deadline for a page that can take money, because your content runway has nowhere to send people without one.

The scanner doesn't need to exist until the morning of 3 October. That's nineteen days away, not one.

So split it:

| Phase | When | What ships | Risk |
|---|---|---|---|
| **A — Page live** | Tonight → Monday AM | The ticket page + a **Paystack Payment Page** (hosted, built in their dashboard, zero code). Registrations land in Paystack. | Very low |
| **B — Real checkout** | 16–23 Sept | Supabase, orders table, `/api/checkout`, webhook, QR ticket, confirmation email, admin list. Swap the button target. | Medium |
| **C — Door systems** | 24 Sept – 2 Oct | Scanner PWA, offline manifest, queued check-ins, conflicts view, door rehearsal. | Medium |

**Phase A is the recommendation and it is not a compromise.** A Paystack Payment Page collects name, email and phone through custom fields, takes card/transfer/USSD, and emails a receipt. It takes about ten minutes to set up. Tomorrow you announce with a real page and a real checkout, and nobody outside your head knows the QR pipeline isn't built yet.

The one thing to say out loud on the page during Phase A: *"Your QR ticket arrives by email closer to the event."* That's true, it's normal for events, and it buys you the whole of week two.

**What I'd push back on:** trying to ship Phase B tonight so tomorrow is "proper". You'd be wiring a webhook you can't fully test at 3am against a deadline that doesn't actually require it. Ship the page, take the money through Paystack's own page, sleep, build the real thing on Tuesday with a clear head.

---

## 3. Phase 0 — gather before you open Claude Code

**Accounts and keys**

- [ ] **Paystack: create a second Business** inside your existing account (Settings → Business). This is the single sharpest technical gotcha in the whole build. Webhook URLs are configured **per business**, so a second app on the same business either never receives events or fires them at the wrong app. A second business gets its own keys and its own webhook URL. Do this before anything else.
- [ ] Supabase project — new, free tier is fine for 100 seats
- [ ] Resend account + a verified sending domain (domain verification can take a few hours — start it today)
- [ ] Vercel project + the subdomain you'll use (`summit.` something you already own)

**Assets**

- [ ] FlagIQ logo as SVG → `/public/logo.svg` ✅ you have this
- [ ] AI UniPod venue photos ✅ you have these — one wide shot for the hero, one for the "in the room" section
- [ ] Speaker headshots ⚠️ missing — Michael Pepper, Prof. Chika, Saheed Niyi. Placeholders are in the design; chase these today.
- [ ] OG image, 1200×630, **under 300KB** — WhatsApp silently drops heavier ones and your link preview is your single most-shared asset

**Decisions only you can make**

- [ ] **Refund policy.** Write it before you take the first naira. You will be asked on day one. Currently `TODO` in config and flagged as an open item on the page.
- [ ] Support WhatsApp number for the page
- [ ] Sales close time — 2 Oct 23:59, or when 100 sell, whichever comes first
- [ ] Does the buyer absorb the Paystack fee? Config flag is `passFeeToBuyer`. At ₦10,000 the fee is ₦250. My call: **absorb it** — ₦10,000 flat is a cleaner number than ₦10,250 and the brief says the price is locked.

---

## 4. Changes to the contracts

Keep `types/ticketing.ts` and `lib/data-access.ts` almost exactly as they are. Four changes:

**4.1 — Add the ticket type.** This is the biggest gap: the contracts assume one paid ticket. The summit has a free livestream tier.

```ts
export type TicketType = "in_person" | "livestream";
```

Add `ticketType: TicketType` to both `Order` and `Ticket`. Then — and this is the part that must not be got wrong — **capacity counts only `in_person`**, enforced in SQL, not in the UI. Livestream registrations are unlimited.

**4.2 — Matric number becomes attendee type.** The sign-out party was students-only. The summit is a deliberately mixed room, and `buyerMatricNumber` / `requireMatricNumber` are now wrong. Replace with:

```ts
export type AttendeeType = "student" | "professional" | "founder";
```

Keep it required. It's one dropdown for the buyer and it's the segmentation that makes your follow-up worth anything.

**4.3 — Code prefix.** `SGN-XXXX-XXXX` → `FIQ-XXXX-XXXX`. Change `formatTicketCode()` and the regex in `isValidTicketCodeShape()` together, in one commit, or you'll ship a validator that rejects every code you issue.

**4.4 — Config gains two arrays.** Rename `event.config.ts` → `summit.config.ts` and add `speakers[]` and `programme[]`. Both are config, not markup, so adding the fourth speaker is a one-line edit — which is exactly what makes it a second announcement moment for the content runway.

`assertConfigComplete()` already exists and throws on surviving `TODO`s. **Call it at build time** so a forgotten placeholder breaks the deploy instead of reaching a paying attendee.

---

## 5. `CLAUDE.md` — paste this at the repo root

```md
# FlagIQ AI Summit '26 — ticketing

Ticket sales and door check-in for a 100-seat paid event on 3 October 2026
at the AI UniPod, University of Lagos. Built by FlagIQ, run by FlagIQ.

## The real product

Two screens carry this build, and neither is the landing page.

1. **Checkout.** Real money from real strangers. If an order is marked paid
   when it isn't, or a buyer pays and gets no ticket, that's a public
   failure in a room of 100 people who know each other.
2. **The door scanner on 3 October.** It runs on staff phones, on venue
   wifi that will be bad, with a queue of people waiting. It must work
   offline and it must never admit the same code twice.

The landing page is marketing. These two are the product.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 ·
Supabase (Postgres + Auth) · Paystack · Resend · Vercel

## The contracts — do not break these

- `types/ticketing.ts` — the data model. The database schema must match it
  exactly. Do not add, rename or remove fields without a migration in the
  same commit.
- `config/summit.config.ts` — every event-specific string, price, date,
  colour and asset. NOTHING project-specific may be hardcoded in a
  component. Swapping this file turns this into a different event; that
  reusability is a commercial asset, not housekeeping.
- `lib/data-access.ts` — the ONLY seam between UI and data. Components
  import from here and nowhere else. Signatures are final. Never import
  `lib/mock-data.ts` from a component.

`grep -rn "TODO(handoff)" .` is the work queue.

## Hard rules

- **All money is integer kobo.** Never floats, never naira in the database.
- **The client never decides an order is paid.** Only the Paystack
  `charge.success` webhook does. `confirmPurchase()` on redirect is
  read-only.
- **Totals are computed server-side** from config. Never trust a posted
  amount.
- **Capacity is enforced in a transaction**, server-side, counting
  `ticket_type = 'in_person'` only. Hiding the button is not enforcement.
- **Check-in is first-scan-wins** as a conditional UPDATE
  (`WHERE code = $1 AND status = 'valid'`). Zero rows affected means
  already used. Never read-then-write — two doors will race.
- **RLS on every table.** The anon role must never read order or ticket
  rows. Public counts come from a SECURITY DEFINER RPC returning numbers
  only.
- **Door staff never get buyer contact details.** The offline manifest is
  code, holder name, attendee type, status. Nothing else. This is a
  deliberate privacy boundary, not an oversight.
- Ticket codes are generated server-side with a CSPRNG. Never on the client.

## Deployment reality

Attendees are in Lagos on mid-tier Android phones on metered mobile data
at roughly ₦431/GB. The page must be fast and light on a bad 3G connection.
Door phones will be on unreliable venue wifi — offline is the default
assumption, not the edge case.

Most support will arrive by WhatsApp, not email. Surface a WhatsApp link
everywhere something can go wrong.

## Design

Public pages: light editorial. Paper `#F5F4F0`, ink `#030617`,
Flag Red `#CA3A32`. Fraunces 900 display, Instrument Sans body,
JetBrains Mono for codes, times and money.

Admin and scanner: **do not** inherit that. Dense, high-contrast,
utilitarian. Big tap targets on the scanner — it's used one-handed, in
a queue, in the dark.

## Commands

npm run dev · npm run build · npm run lint
```

---

## 6. Claude Code session prompts

### Session A — tonight. Ship the page.

```
This repo is a bare create-next-app scaffold. The real contracts live in a
sibling folder at ../signout-tickets — types/ticketing.ts, lib/data-access.ts,
lib/mock-data.ts and config/event.config.ts.

Read all four of those files first, then read CLAUDE.md at this repo root.

Do this, in order:

1. Copy the four contract files into this repo: types/ticketing.ts,
   lib/data-access.ts, lib/mock-data.ts, and config/event.config.ts renamed
   to config/summit.config.ts. Fix the @/ import paths. Confirm the build
   passes before continuing.

2. Apply these four contract changes:
   a. Add `export type TicketType = "in_person" | "livestream"` and add a
      `ticketType: TicketType` field to both Order and Ticket.
   b. Replace buyerMatricNumber / holderMatricNumber / requireMatricNumber
      with `AttendeeType = "student" | "professional" | "founder"`.
      Required, not nullable.
   c. Change the ticket code prefix from SGN to FIQ — formatTicketCode()
      and the regex in isValidTicketCodeShape() together, one commit.
   d. Add `speakers[]` and `programme[]` arrays to summit.config.ts.
      Speaker: { id, name, role, photoUrl, bio }.
      Programme slot: { time, title, durationMins, speakerId? }.

3. Fill in every TODO in summit.config.ts from the event brief I'm pasting
   below. Then call assertConfigComplete() at build time so a surviving
   placeholder breaks the deploy.

4. Build the public ticket page at app/page.tsx from the design I'm
   attaching. Server component. Every string, price, speaker and programme
   slot comes from summit.config.ts — nothing hardcoded in the markup.
   The quantity stepper and total are client-side and must use
   orderTotalKobo() from types/ticketing.ts, not reimplemented maths.

5. The "Pay with Paystack" button is an external link to a Paystack Payment
   Page URL held in config as `ticketing.hostedCheckoutUrl`. Leave a
   TODO(handoff) noting this gets replaced by initiatePurchase() in the
   next session. Do NOT build Supabase, API routes, or a webhook tonight.

6. Metadata and Open Graph: title, description, and og:image from config.
   Report the actual byte size of the OG image — it must be under 300KB or
   WhatsApp drops the preview.

Do not add any dependency beyond what's already in package.json without
telling me why first.

Done when: npm run build passes clean, the page renders at every breakpoint
from 360px up, and the Paystack link opens.
```

*Paste in: the event brief from `claude/planning-decisions.md`, and the design HTML.*

### Session B — Tuesday. The real checkout.

```
Read CLAUDE.md and the three contract files first.

Build the real purchase flow. Replace the hosted Paystack link with the app's
own checkout. Work in this order and stop at each checkpoint so I can test.

1. Supabase schema matching types/ticketing.ts exactly: orders, tickets,
   check_ins, staff_users, event_settings. Integer kobo columns. Unique
   index on orders.reference and tickets.code. RLS enabled on every table
   with no anon read policy on orders or tickets.

2. A SECURITY DEFINER RPC `get_sales_summary()` returning counts only —
   never rows. This is what the public seat meter calls.
   Capacity counts ticket_type = 'in_person' ONLY.

3. POST /api/checkout:
   - validate with a zod schema shared between client and server
   - compute totalKobo server-side from event_settings, never from the body
   - check remaining capacity inside a transaction, reject if sold out
   - enforce salesCloseAt server-side
   - insert the order as 'pending', call Paystack Initialize Transaction
   - rate-limit per IP and per phone number
   Then replace the body of initiatePurchase() in lib/data-access.ts with a
   call to it. Do not change the signature.

4. POST /api/webhooks/paystack:
   - verify the x-paystack-signature HMAC before reading the body
   - idempotent: the same event delivered twice must not issue two tickets
   - on charge.success: mark paid, generate ticket codes server-side with
     a CSPRNG using the CODE_ALPHABET from types/ticketing.ts, send the email
   Confirm in your reply which Paystack Business's webhook URL this is
   registered against.

5. Ticket email via Resend: QR code encoding the ticket code, the code in
   large readable text underneath, date, time, venue, map link, WhatsApp
   support. Must render in Gmail on Android — that's what most attendees use.

6. The free livestream path: same orders table, ticket_type 'livestream',
   total_kobo 0, no Paystack round trip, excluded from capacity in SQL.
   Different confirmation email — stream link, not a QR code.

After each of 3, 4 and 5, stop and tell me what to test by hand.

Done when: I can buy a real seat with a real ₦100 test charge and receive a
QR ticket by email, and a livestream registration produces no charge and no
QR.
```

### Session C — the door. Build this by 29 Sept, not 2 Oct.

```
Read CLAUDE.md first. This session is the scanner and the admin surfaces.
Neither inherits the public page's design language — dense and utilitarian,
big tap targets, high contrast, readable in a dark venue.

1. /scan — a PWA. Camera QR scan. Renders every branch of the CheckInResult
   union from types/ticketing.ts: admitted, already_used, not_found, voided,
   unpaid. Each branch gets a visually distinct full-screen result — door
   staff read it at a glance, one-handed, with people waiting.

2. Offline first. Cache the manifest from getCheckInManifest() before doors
   open. Scans work with no network and queue locally. Sync on reconnect,
   server resolves conflicts by earliest scannedAt. Show queue depth and
   online state permanently on screen.

3. Check-in must be a conditional UPDATE — WHERE code = $1 AND status =
   'valid'. Zero rows affected means already_used. Write a check_ins row
   for EVERY scan including rejections; it's the audit log.

4. /admin — staff auth via Supabase Auth, role-gated. Sales summary, order
   search by name/phone/reference, CSV export, resend ticket email, void a
   ticket with a required reason, issue a complimentary ticket, and a
   conflicts view showing duplicate scan attempts.

5. **Manual payment entry.** An admin form to mark someone paid and issue a
   ticket without a Paystack transaction. This is not optional — a real
   share of 100 Nigerian attendees will send a bank transfer and WhatsApp
   you the receipt.

Report measured numbers, not assertions: scanner time-to-result in
milliseconds on a throttled connection, and the page weight of /scan in KB.

Done when: I can scan a ticket in airplane mode, the second scan of the same
code is rejected, and reconnecting syncs the queue with no duplicates.
```

---

## 7. The manual QA pass — you run this, not the agent

Before you announce on Monday:

| Check | How |
|---|---|
| WhatsApp link preview | Send the URL to yourself on WhatsApp. Title, description and image must all appear. This is your most-shared asset. |
| Real device | Open it on the cheapest Android you can find, on mobile data, not wifi. |
| Payment, end to end | Set the Paystack Page to ₦100, pay it with your own card, confirm the receipt lands. Then set it to ₦10,000. |
| Page weight | Under 500KB total on first load. Your audience pays roughly ₦431/GB. |
| 360px | The narrowest phone still in real use in Lagos. Nothing overflows sideways. |

Before 3 October:

| Check | How |
|---|---|
| Ticket email | Gmail on Android, not desktop. QR must be scannable from the screen at arm's length. |
| Scanner, airplane mode | Scan, admit, scan the same code again → rejected. Reconnect → syncs once, not twice. |
| Two doors racing | Two phones scan the same code within a second. Exactly one admits. |
| Capacity | Sell to 100 in staging. The 101st must be refused server-side, not just hidden. |
| Security | From the browser console with the anon key, try to read the orders table. It must return nothing. |
| Bank transfer path | Have someone send money outside checkout. Issue their ticket by hand. Time it. |
| Reuse proof | Swap `summit.config.ts` for a different event. Nothing should break. |

---

## 8. The commercial note

Once this is built, `summit.config.ts` is the whole product and everything else is infrastructure. You'll have a white-label event ticketing system for the Nigerian market, config-swappable per event, with offline door check-in that Eventbrite doesn't do well here and Tix.africa charges per ticket for.

You're building it for one summit. Price the next one as a product.