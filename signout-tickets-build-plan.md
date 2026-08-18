# Sign-Out Ticketing Platform — Build Plan

**Event:** Faculty of Engineering final-year sign-out after-party, UNILAG
**Window:** under 3 weeks
**Scale:** 200–500 tickets, single tier
**Payments:** Paystack only
**Door:** staff web scanner with offline fallback

---

## 0. What the grounding revealed

You described a payments problem. It isn't one. Paystack solves payments in an afternoon.

**The real product is a door-control tool.** Here is the actual failure scenario for a faculty hall sign-out party:

It's 9pm. There are 400 paid tickets and 700 people outside, because everybody who paid forwarded their QR code to a friend on WhatsApp "just to show them what it looks like." Two bouncers are standing in bad light holding their own phones, on faculty wifi that doesn't reach the door. Somebody's screenshot scans green. Somebody else's screenshot of the *same* ticket also scans green, because the two bouncers' phones aren't talking to each other. Now you have 500 people in a hall rated for 400, and a Dean.

That is the screen that justifies the entire build. Everything else — the landing page, the checkout, the sales dashboard — is table stakes that any no-code tool could do. The scanner is the thing that has to be right.

**Three consequences that shape the architecture:**

1. **QR codes must be single-use and identity-bound.** The scan result screen must show the buyer's **full name and phone number**, big, so the bouncer can say "what's the phone number on this ticket?" A green tick alone is worthless against screenshot sharing.
2. **The scanner has to work with no network.** Not "should ideally." The hall interior will kill data. This means the full valid-ticket list caches to the device *before* doors open, scans validate locally, and check-ins queue for sync.
3. **The distribution channel is WhatsApp, not email.** Nigerian students will not check email at the door. The ticket has to be a shareable link that renders a proper preview, plus a downloadable PNG they can save to their gallery. Email is the backup, not the primary.

**The flaw in "just use Paystack":** see the compliance section below. It's a timeline risk, not a technical one, and it's the only thing in this plan that can actually sink you.

---

## 1. Two things that can kill this — handle on day one

### The ₦2M Starter Business ceiling

> **RESOLVED for this instance (2026-08-18):** the account is live, activated and
> uncapped, so nothing below blocks this event. Compliance is OFF the critical
> path. Kept because it still applies to the next faculty reusing this build.

If your Paystack account is a **Starter Business** (unregistered — no CAC), it has a **₦2,000,000 lifetime collections limit**, and payments get **disabled** when you hit it. At 400 tickets you cross that at a ₦5,000 ticket price. At ₦10,000 you'd hit the wall at ticket 200 and the checkout would simply stop working mid-sale.

**Do this today, before writing any code:**

- Log into your Paystack dashboard and check your business tier and remaining limit.
- If you're on Starter and expect to collect over ₦2M, upgrade to a **Registered Business**. That needs CAC documents, and approval is not instant. This is the single longest-lead item in the whole project.
- If you don't have CAC and can't get it in time, the fallback is running collections through an already-registered entity — FlagIQ, if it's registered — and settling to the party account after. Decide this in the next 48 hours, not in week three.

### Settlement timing vs. when you need the cash

Money doesn't land the moment someone pays. Confirm your settlement cycle in the dashboard and check it against when you have to pay the DJ, the caterer, and the hall. If vendors need deposits before settlement clears, you need a float — that's a treasury problem, not a software problem, but it's yours either way.

**Fees, for your pricing model:** local cards are **1.5% + ₦100**, the ₦100 waived under ₦2,500, and total fee **capped at ₦2,000**. On a ₦10,000 ticket that's ₦250. Decide now whether you absorb it or pass it on — if you pass it on, the ticket price shown must include it, and the config file has a flag for exactly this.

---

## 2. Stack — decided, not offered

| Layer | Choice | Why |
|---|---|---|
| Visual builder | **Google AI Studio (Build mode)** | Your pick. Free and fast. Two consequences you're accepting, both handled below: it outputs **React + Vite**, and it will build you a backend you didn't ask for unless the prompt forbids it in strong terms. |
| Framework (final) | **Next.js 15, App Router, TypeScript** | You need a server for the Paystack webhook, and server-rendered HTML for WhatsApp link previews. A Vite SPA cannot do the second — WhatsApp's crawler does not run JavaScript. **AI Studio's Vite output gets migrated to Next.js at the start of Session 1. Budget one day for this.** |
| Styling | Tailwind, hand-rolled components | AI Studio has no shadcn/ui. Plain Tailwind components, which survive the Next.js migration untouched. |
| Backend | **Supabase** (Postgres, RLS, Realtime) | You already run it. RLS is what stops someone reading the full guest list from the browser console. |
| Payments | **Paystack** — Initialize + webhook | OPay, bank transfer, USSD and cards all ride inside one Paystack checkout. One integration, one webhook, one reconciliation. |
| QR scan | `BarcodeDetector` API, `@zxing/browser` fallback | Native on Android Chrome (fast), zxing covers iOS Safari. |
| Offline | IndexedDB via `idb` + service worker | Ticket list cached pre-doors; check-ins queued and flushed. |
| Email | Resend | Backup delivery only. |
| Deploy | Vercel | You already use it. |

**On the direct-OPay integration you asked about:** skip it. OPay is already a payment channel inside Paystack checkout — an OPay user pays with OPay and never notices the difference. A separate direct integration means a second merchant approval, a second webhook, a second reconciliation surface, and two sources of truth for "is this ticket paid." For a one-night event three weeks out, that's a bad trade. If you still want OPay money landing in your OPay wallet specifically, that's a settlement-destination question, not an integration question.

---

## 3. Phase 0 — gather before you prompt anything

Do not start building until these exist. Anything unresolved becomes a config placeholder, never a hardcoded string.

**Accounts and keys**

- [ ] Paystack tier confirmed / upgrade started (blocking — day one)
- [ ] Paystack test + live secret and public keys
- [ ] Supabase project created, URL + anon key + service role key
- [ ] Resend account + verified sending domain
- [ ] Vercel project + the domain you'll put on the flyer
- [ ] GitHub repo (private)

**Event facts**

- [ ] Exact event name, date, doors-open time, end time
- [ ] Hall name and full address
- [ ] **Capacity number** — the real fire-code one, not the aspirational one
- [ ] Ticket price, and whether the Paystack fee is absorbed or added
- [ ] Sales close date/time
- [ ] Dress code, what's included (drinks? food?), age/ID policy
- [ ] Who to contact for support — a WhatsApp number, not an email
- [ ] Refund policy, written out. Decide it now. You will be asked.

**Assets**

- [ ] Logo (SVG or high-res PNG)
- [ ] Hero image or flyer artwork
- [ ] Brand colours (hex)
- [ ] Names + roles of the door staff who get scanner logins

**Decisions to make now**

- [ ] Do you hold back tickets? Recommendation: publish capacity at **90%** of the real number and keep 10% as your buffer for VIPs, lecturers, and the friend who "already paid, I swear."
- [ ] Are non-Engineering students allowed to buy?
- [ ] One purchase = one ticket, or can one person buy several? (Plan below assumes multiple allowed, each generating its own QR — it's the same code and saves you a support headache.)

---

## 4. The contracts

Write these three files by hand, first, before any prompt goes to any tool. They are the agreement between the visual builder and Claude Code. Neither tool gets to redesign them.

### `/types/ticketing.ts`

```ts
// ============================================================
// CONTRACT — the data model. The database schema must match
// this exactly. Do not extend or deviate without a deliberate
// reason and a matching migration in the same commit.
// ============================================================

export type OrderStatus =
  | "pending"      // initialized with Paystack, not yet paid
  | "paid"         // webhook confirmed
  | "failed"       // Paystack reported failure
  | "abandoned"    // initialized, never completed, timed out
  | "refunded";

export type TicketStatus =
  | "valid"        // paid, never scanned
  | "checked_in"   // scanned at the door
  | "void";        // manually revoked by an admin

/** A purchase. One order may contain several tickets. */
export interface Order {
  id: string;                    // uuid
  reference: string;             // Paystack transaction reference — unique
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;            // normalised to +234XXXXXXXXXX
  quantity: number;
  unitPriceKobo: number;         // ALL money in kobo. Never floats.
  serviceChargeKobo: number;     // retained by FlagIQ. NOT a tax — see event.config.ts
  feeKobo: number;               // Paystack's gateway fee, if passed to buyer
  totalKobo: number;             // authoritative, computed server-side
  status: OrderStatus;
  paystackChannel: string | null;   // "card" | "bank_transfer" | "ussd" | "mobile_money" ...
  createdAt: string;             // ISO 8601
  paidAt: string | null;
}

/** One admittance. One QR code. Single use. */
export interface Ticket {
  id: string;                    // uuid
  orderId: string;
  code: string;                  // human-readable, e.g. "SGN-7K2Q-9XM4". Goes in the QR.
  holderName: string;            // defaults to buyer, editable before the event
  /** The door's identity check. Denormalised from the order deliberately:
   *  the scanner caches Ticket rows in IndexedDB and never sees an Order,
   *  so this has to live here or /scan goes blind offline. Not holder-
   *  editable — a renameable identity check is not an identity check. */
  holderPhone: string | null;
  status: TicketStatus;
  issuedAt: string;
  checkedInAt: string | null;
  checkedInBy: string | null;    // staff user id
  checkedInDevice: string | null;// which door phone — needed to debug double-scans
}

/** An audit row. Written for every scan, including rejected ones. */
export interface CheckIn {
  id: string;
  ticketId: string | null;       // null when the scanned code matched nothing
  scannedCode: string;
  result: CheckInResultKind;
  staffId: string;
  deviceId: string;
  scannedAt: string;
  syncedAt: string | null;       // null while still queued offline
}

export type CheckInResultKind =
  | "admitted"
  | "already_used"
  | "not_found"
  | "voided"
  | "unpaid";

/** What the scanner screen renders. Every branch must have a design. */
export type CheckInResult =
  | { kind: "admitted"; ticket: Ticket; admittedCount: number }
  | { kind: "already_used"; ticket: Ticket; firstScannedAt: string; firstScannedBy: string }
  | { kind: "not_found"; scannedCode: string }
  | { kind: "voided"; ticket: Ticket }
  | { kind: "unpaid"; ticket: Ticket };

/** The admin dashboard's single source of truth. */
export interface SalesSummary {
  capacity: number;
  ticketsSold: number;
  ticketsRemaining: number;
  ticketsCheckedIn: number;
  grossKobo: number;
  netKobo: number;               // gross minus Paystack fees
  ordersPending: number;
  isSoldOut: boolean;
  salesClosed: boolean;
  byChannel: Record<string, number>;
  lastUpdatedAt: string;
}

export interface StaffUser {
  id: string;
  name: string;
  role: "admin" | "door";
}

// ---- Async state unions: let the UI render every state pre-backend ----

export type PurchaseState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "redirecting"; authorizationUrl: string }
  | { status: "confirming" }                          // returned from Paystack, verifying
  | { status: "success"; order: Order; tickets: Ticket[] }
  | { status: "sold_out" }
  | { status: "sales_closed" }
  | { status: "error"; message: string };

export type ScannerState =
  | { status: "initialising" }
  | { status: "camera_denied" }
  | { status: "ready"; cachedTicketCount: number; queuedCheckIns: number; online: boolean }
  | { status: "scanning" }
  | { status: "result"; result: CheckInResult; online: boolean; queuedCheckIns: number };

// ---- Pure helpers both UI and server need. One definition only. ----

export const koboToNaira = (kobo: number): string =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;

/** Mirrors Paystack's Nigerian local-card pricing. Verify against your
 *  dashboard before go-live — pricing changes. */
export function paystackFeeKobo(amountKobo: number): number {
  const percentage = Math.ceil(amountKobo * 0.015);
  const flat = amountKobo < 250_000 ? 0 : 10_000; // ₦100 waived under ₦2,500
  return Math.min(percentage + flat, 200_000);     // capped at ₦2,000
}

/** Paystack charges its percentage on the TOTAL collected, including any fee
 *  added on top. So subtotal + paystackFeeKobo(subtotal) UNDER-recovers: the
 *  organiser ends up ₦2.23 short per ₦3,000 ticket (₦669 across 300). This
 *  inverse finds the smallest total that nets the subtotal after the fee. */
export function grossUpForPaystackFee(subtotalKobo: number): number;

/** The SINGLE definition of what an order costs. Checkout UI, public price
 *  tag, fixtures and server all call this — never recompute by hand, and
 *  never accept a total from the client. */
export function computeOrderTotals(input: {
  quantity: number;
  unitPriceKobo: number;
  serviceChargeRate: number;
  passFeeToBuyer: boolean;
}): OrderTotals;   // { baseKobo, serviceChargeKobo, subtotalKobo, gatewayFeeKobo, totalKobo }

export function normaliseNgPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
}
```

### `/config/event.config.ts`

Every instance-specific value lives here. Nothing project-specific may be hardcoded into a component.

```ts
// ============================================================
// CONTRACT — everything variable about THIS event.
// Swapping this one file turns the build into a different event.
// ============================================================

export const eventConfig = {
  event: {
    name: "TODO: Engineering Sign-Out After-Party",
    tagline: "TODO",
    hostedBy: "TODO: Faculty of Engineering, University of Lagos",
    date: "TODO: 2026-00-00",
    doorsOpen: "TODO: 20:00",
    endsAt: "TODO: 04:00",
    venueName: "TODO: Faculty of Engineering Hall",
    venueAddress: "TODO",
    venueMapUrl: "TODO",
    dressCode: "TODO",
    includes: ["TODO"],
    policies: {
      ageOrIdPolicy: "TODO",
      refundPolicy: "TODO — write this before launch",
    },
  },

  ticketing: {
    priceKobo: 0,              // TODO — what the organiser KEEPS per ticket
    currency: "NGN" as const,
    capacity: 0,               // TODO: 90% of real hall capacity
    maxPerOrder: 5,
    passFeeToBuyer: false,     // true => Paystack fee added on top at checkout
    lowStockThreshold: 30,     // show "only N left" below this

    // Platform fee ON TOP of priceKobo. A SERVICE CHARGE, NOT VAT — it is
    // retained, not remitted. Never label it VAT and never name a column
    // vat_kobo unless you are actually VAT-registered and remitting.
    serviceChargeRate: 0,      // TODO e.g. 0.075
    serviceChargeLabel: "Service charge",

    // PRIMARY sales gate, controlled from /admin. Sales stay open until the
    // organiser closes them or capacity is reached. No date-based auto-close.
    salesOpen: true,

    // BACKSTOP ONLY, never the primary gate — stops someone buying a ticket
    // for a party that already finished.
    salesHardStopAt: "TODO: ISO 8601",
  },

  brand: {
    primary: "#TODO",
    accent: "#TODO",
    ink: "#TODO",
    surface: "#TODO",
    logoUrl: "/assets/logo.svg",
    heroImageUrl: "/assets/hero.jpg",
    ogImageUrl: "/assets/og.jpg",
    fontHeading: "TODO",
    fontBody: "TODO",
  },

  support: {
    whatsappNumber: "TODO: +234...",
    whatsappMessage: "Hi, I need help with my sign-out ticket",
    email: "TODO",
    organiserName: "TODO",
  },

  seo: {
    siteUrl: "TODO: https://...",
    title: "TODO",
    description: "TODO",
  },

  featureFlags: {
    allowNameChange: true,       // holder can rename their ticket before the event
    showLiveSalesCounter: true,  // "312 going" on the public page — social proof
    offlineScannerEnabled: true,
  },
} as const;

export type EventConfig = typeof eventConfig;
```

### `/lib/data-access.ts`

The single seam. Every function async, every one returning mock data with a fake delay, every signature final.

```ts
import type {
  Order, Ticket, CheckInResult, SalesSummary, StaffUser,
} from "@/types/ticketing";

// ============================================================
// CONTRACT — the ONLY boundary between UI and data.
// Components import from here and nowhere else.
// TODO(handoff): replace every body with real queries.
// Signatures must NOT change — components depend on them.
// ============================================================

export async function getSalesSummary(): Promise<SalesSummary>;
export async function initiatePurchase(input: {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  quantity: number;
}): Promise<{ authorizationUrl: string; reference: string }>;

export async function confirmPurchase(
  reference: string
): Promise<{ order: Order; tickets: Ticket[] }>;

export async function getTicketByCode(code: string): Promise<Ticket | null>;
export async function getOrderByReference(reference: string): Promise<{
  order: Order; tickets: Ticket[];
} | null>;

// holderPhone is deliberately NOT a parameter: it is the door's identity check,
// so the holder must not be able to rewrite it.
export async function renameTicketHolder(
  ticketId: string, holderName: string
): Promise<void>;

// ---- Door / scanner ----
export async function getCheckInManifest(): Promise<Ticket[]>;   // cached pre-doors
export async function checkInTicket(input: {
  code: string; staffId: string; deviceId: string; scannedAt: string;
}): Promise<CheckInResult>;
export async function syncQueuedCheckIns(
  queued: Array<{ code: string; staffId: string; deviceId: string; scannedAt: string }>
): Promise<CheckInResult[]>;

// ---- Admin ----
export async function listOrders(opts?: {
  status?: Order["status"]; query?: string; limit?: number; offset?: number;
}): Promise<{ orders: Order[]; total: number }>;
export async function listTickets(opts?: {
  status?: Ticket["status"]; query?: string;
}): Promise<Ticket[]>;
export async function voidTicket(ticketId: string, reason: string): Promise<void>;
export async function issueComplimentaryTicket(input: {
  holderName: string; holderPhone: string | null;
}): Promise<Ticket>;
export async function exportOrdersCsv(): Promise<string>;
export async function getCurrentStaffUser(): Promise<StaffUser | null>;
```

**Why `initiatePurchase` returns a URL and not a ticket:** payment happens off-site at Paystack. The client never decides whether an order is paid — the webhook does. Baking that into the contract now stops the visual builder from inventing a fake "payment succeeded" client-side flow you'd have to tear out later.

---

## 5. Visual track — three prompts for Google AI Studio

Copy each block whole into AI Studio's Build mode. Verify after each before moving on.

**Three AI Studio-specific things before you start:**

- **Connect nothing.** No API keys, no linked services, no environment variables. An empty environment is the strongest available signal that backend work is out of scope. AI Studio provisions infrastructure unprompted when it sees credentials.
- **Use the annotation toolbar for small visual fixes.** Click an element in the preview and describe the change, rather than burning a whole prompt on "make the button bigger."
- **Export via GitHub push, not ZIP.** You want version control from the first commit.

### Prompt 1 — Foundation and public event page

```
You are building ONLY the visual front-end of a ticketing site for a university
sign-out party in Lagos, Nigeria. A separate engineer will add all backend
functionality later using Claude Code. Your job is design and presentation only.
Read the constraints carefully — what you must NOT build matters as much as what
you must build.

=== ABSOLUTE CONSTRAINTS — DO NOT VIOLATE ===
DO NOT build a backend, a server, or a Node service of any kind.
DO NOT install or configure any database, ORM, or backend service.
DO NOT create API routes, route handlers, or server endpoints.
DO NOT write fetch(), axios, or any network call.
DO NOT integrate the Gemini API or any AI model. This app uses no AI.
DO NOT integrate Paystack, Stripe, or any payment SDK.
DO NOT use localStorage, sessionStorage, or cookies.
DO NOT implement authentication of any kind.
DO NOT create .env files or reference environment variables.
DO NOT install ANY npm package beyond the allowlist below. Do not add packages
on your own initiative, even helpful ones.
DO NOT write email, form submission, or data persistence logic.

If a feature seems to need data, read it from the mock data file. If a button
seems to need an action, call a prop callback and leave a `// TODO(handoff):`
comment. That is the CORRECT behaviour — do not "helpfully" implement the
backend. A working backend is the WRONG output for this task and I will delete
it. The interface is the entire deliverable.

=== STACK ===
React 18 + Vite + TypeScript + Tailwind CSS. Client-side only.
Routing via react-router-dom. No server-side rendering, no framework beyond this.

=== ALLOWED DEPENDENCIES (nothing else) ===
react, react-dom, react-router-dom, typescript, vite, tailwindcss,
lucide-react, clsx, react-hook-form, zod, @hookform/resolvers

=== STEP 1: WRITE THE CONTRACT FILES FIRST ===
Create these three files exactly as given, before any component.

[PASTE /types/ticketing.ts IN FULL]

[PASTE /config/event.config.ts IN FULL]

Put them at src/types/ticketing.ts and src/config/event.config.ts.
Configure the Vite path alias "@" to point at ./src so "@/types/ticketing" and
"@/config/event.config" resolve. Do not change the import style in these files.

Then create src/lib/mock-data.ts with realistic Nigerian sample data: 12 orders in
mixed states (paid, pending, failed), ~20 tickets across them, Nigerian names,
+234 phone numbers, a SalesSummary
with capacity 300 / sold 214, and 6 CheckIn rows.

These types are a CONTRACT. A backend will be built to match them exactly. Do
not add, rename, or remove fields.

=== STEP 2: DESIGN TOKENS ===
Wire every colour, font, and asset path from eventConfig.brand into the Tailwind
theme via CSS variables. No hex value may appear in any component file.
Aesthetic: a night event for final-year engineering students. Confident, modern,
a little celebratory. Dark surface, high contrast, one strong accent. Not
corporate, not childish.

=== STEP 3: COMPONENT LIBRARY ===
All components pure and presentational — props in, JSX out, zero data fetching.

- <Countdown targetIso: string> — days/hrs/mins to doors open
- <CapacityMeter sold, capacity, lowStockThreshold> — progress bar; switches to
  an urgent treatment below threshold; renders a distinct SOLD OUT state
- <PriceTag priceKobo, feeKobo, passFeeToBuyer> — uses koboToNaira from the
  types file; when passFeeToBuyer is true, shows "₦X + ₦Y fee" broken out
- <DetailRow icon, label, value>
- <QuantityStepper value, min, max, onChange> — minimum 48x48px tap targets
- <StatusBadge status> — one visual per OrderStatus and TicketStatus
- <WhatsAppSupportButton> — renders a wa.me link built from eventConfig.support
- <SectionHeading>

=== STEP 4: THE PUBLIC EVENT PAGE (src/pages/EventPage.tsx, route "/") ===
Single scrolling page, in this order. All copy from eventConfig — no hardcoded
strings anywhere.

1. Hero — logo, event name, tagline, date, venue, Countdown, primary CTA
   "Get your ticket". Hero image with a dark overlay for text contrast.
2. Live status strip — CapacityMeter plus "N going" when
   featureFlags.showLiveSalesCounter is true.
3. What to expect — the includes[] list as icon cards.
4. The details — date, doors open, venue with map link, dress code, age/ID
   policy, as DetailRows.
5. Price and CTA — PriceTag, "Sales close [date]", big CTA.
6. FAQ accordion — include the refund policy verbatim from config.
7. Footer — organiser, WhatsApp support button, terms link.

Set up react-router-dom with these routes now, most as empty stubs:
  /                      EventPage        (built in this prompt)
  /checkout              CheckoutPage     (stub)
  /ticket/:reference     TicketPage       (stub)
  /admin                 AdminPage        (stub)
  /scan                  ScanPage         (stub)
  /scan/login            ScanLoginPage    (stub)

The CTA navigates to /checkout. No purchase logic.

=== HARD RULES ===
- MOBILE FIRST. Design at 375px, then scale up. Real context: this link gets
  forwarded on WhatsApp and opened almost entirely on mid-tier Android phones on
  mobile data. Assume a slow connection and a small screen.
- All tap targets minimum 48x48px, generously spaced.
- Body text minimum 16px.
- Animate ONLY transform and opacity. Never width, height, top, or left.
- Create a useReducedMotion hook and wrap every non-essential animation in it.
- Every text/background pairing must clear 4.5:1 contrast.
- Explicit width and height on every image.

=== VERIFY ===
Build it. Then list every file you created, paste back the full contents of
src/types/ticketing.ts so I can confirm the contract is intact, list every
package in package.json, and confirm in writing that there are zero network
calls, zero server files, and no Gemini API usage in the codebase.
```

**Verify before moving on:** open it on your actual phone; check for horizontal overflow; change `brand.primary` in the config and confirm every instance updates; run `npm ls --depth=0` and delete anything not on the allowlist; confirm no `server/`, `api/`, or `backend/` folder was created.

### Prompt 2 — Checkout and ticket delivery

```
Continuing the same project. Do not re-explain what exists — build on it.
All constraints from the previous prompt remain in force: no backend, no network
calls, no API routes, no payment SDK, no auth, no storage, no Gemini API, and no
new dependencies except `qrcode.react` which you may now add.

=== SCOPE ===
The purchase flow and the ticket that comes out of it. NO real submission.

=== 1. CHECKOUT PAGE (src/pages/CheckoutPage.tsx, route "/checkout") ===
Form fields: full name, email, phone (Nigerian format, use normaliseNgPhone from
the types file on blur), quantity via QuantityStepper (1 to
ticketing.maxPerOrder). The phone is the door's identity check at the event, not
just a contact field — validate it properly and normalise before submit.

Live order summary alongside: unit price, quantity, Paystack fee broken out when
passFeeToBuyer is true, total. Use paystackFeeKobo from the types file — do not
reimplement the fee maths.

Build the form as a PURE PRESENTATIONAL component:

interface CheckoutFormProps {
  initialValues?: Partial<CheckoutValues>;
  purchaseState: PurchaseState;          // controlled from outside
  onSubmit: (values: CheckoutValues) => void;  // fire and forget
}

The form owns NO submission logic and NO async state. It receives purchaseState
as a prop and renders accordingly. The parent decides what happens on submit.

The parent container's onSubmit contains ONLY:
  // TODO(handoff): replace with real call to initiatePurchase()
  setPurchaseState({ status: "validating" });
  setTimeout(() => setPurchaseState({ status: "redirecting", authorizationUrl: "#" }), 900);

This fake delay exists purely so I can see the loading state. Build nothing more
sophisticated.

=== 2. EVERY STATE OF PurchaseState NEEDS A DESIGN ===
- idle — the form
- validating — disabled form, inline spinner on the button
- redirecting — a full-screen "Taking you to Paystack..." interstitial. Reassure
  the user; this is the moment people abandon.
- confirming — "Confirming your payment..." with a note not to close the tab
- success — see section 3
- sold_out — replaces the form entirely. Sympathetic, with the WhatsApp support
  button and an offer to join a waitlist (button is a no-op stub).
- sales_closed — same treatment, different copy.
- error — the message, a retry button, and the WhatsApp button. Never a dead end.

=== 3. TICKET PAGE (src/pages/TicketPage.tsx, route "/ticket/:reference") ===
This is what the buyer screenshots and forwards. It must look like a ticket, not
a receipt.

Per ticket in the order, render a <TicketCard>:
- The QR code (qrcode.react), encoding ticket.code. Minimum 200x200px, generous
  white quiet zone — it has to scan off a dim phone screen.
- The ticket code in large monospace under the QR, e.g. SGN-7K2Q-9XM4
- Holder name and phone number, prominent
- Event name, date, doors open, venue
- A clear "one entry only — this code works once" line
- Visual treatment differs sharply by status: valid / checked_in / void

Below the tickets:
- "Save ticket as image" button — // TODO(handoff): implement PNG export
- "Add to calendar" button — // TODO(handoff)
- "Rename this ticket" — only when featureFlags.allowNameChange; opens a dialog
  with a name field ONLY — holderPhone is the door's identity check and must
  not be holder-editable; onSave is a prop callback with a TODO(handoff)
- WhatsApp support button

Design this page to be legible as a screenshot with no browser chrome, because
that's how most people will actually present it.

=== 4. DEV STATE SWITCHER ===
Add a temporary dev-only floating panel (fixed bottom-right, development only)
that forces each state so I can review the design without filling the form:
idle, validating, redirecting, confirming, success, sold_out, sales_closed,
error. Add a second row that forces the ticket page into valid / checked_in /
void.

=== VERIFY ===
Cycle every state via the switcher and screenshot each. Confirm the QR renders
at a scannable size on a 375px viewport. Confirm zero fetch() calls exist.
```

**Verify:** click through every state; screenshot the ticket page and try scanning that screenshot with your phone's camera — if it doesn't read, the QR is too small or the contrast is wrong.

### Prompt 3 — Admin dashboard and the door scanner

```
Continuing the same project. All previous constraints remain in force — still no
backend, no network calls, no Gemini API. You may now add `@zxing/browser` and
`idb` — nothing else.

=== ENFORCE THE SEAM ===
Do NOT import src/lib/mock-data.ts into any page or component. Create
src/lib/data-access.ts exporting exactly these async functions, each currently
returning mock data after a simulated 200ms delay:

[PASTE /lib/data-access.ts SIGNATURES IN FULL]

// TODO(handoff): replace every function body with real queries.
// Signatures must not change — components depend on them.

Pages call these functions only. This file is the single seam between UI and
backend.

=== DESIGN LANGUAGE — READ THIS CAREFULLY ===
The admin and scanner surfaces DO NOT share the public page's design language.
The public page is a party. These are tools. Light background, dense
information, system font stack, no decorative motion, no gradients, no hero
imagery. If it looks fun, it's wrong.

=== 1. ADMIN DASHBOARD (src/pages/AdminPage.tsx, route "/admin") ===
Assume the user is already authenticated — build no auth.

- Stat row from SalesSummary: sold / remaining / checked in / gross / net /
  pending orders. Large numbers, small labels.
- CapacityMeter, but in the admin's plainer treatment.
- Sales-by-channel breakdown (card, bank transfer, USSD, mobile money) as a
  simple bar list. No chart library.
- Orders table: reference, buyer name, phone, quantity, total, status, paid at.
  Sortable, searchable by name / phone / reference, filterable by
  status, paginated at 50.
- Row expands to show that order's tickets with their individual statuses.
- Per-row actions: view tickets, resend ticket (stub), void ticket (confirm
  dialog, reason required).
- "Issue complimentary ticket" — a dialog collecting name and phone.
- "Export CSV" button.
- Empty, loading (skeleton rows), and error states for the table.

=== 2. THE DOOR SCANNER (src/pages/ScanPage.tsx, route "/scan") — THE MOST IMPORTANT SCREEN ===

CONTEXT, read it before designing: On event night, a staff member stands at the
entrance of a university hall holding their own phone. A queue of students
pushes forward. Lighting is bad. The wifi does not reach the door and mobile
data is unreliable. Students will present QR codes as screenshots, and some of
those screenshots will be of somebody else's ticket. The staff member must, in
under two seconds and one-handed, know whether to let this person in and what
name to challenge them on. Speed and legibility beat everything. No animation
anywhere on this screen.

Layout:
- Persistent top bar: online/offline dot, "N tickets cached", "N check-ins
  queued", admitted count vs capacity. Always visible.
- Camera viewfinder filling most of the screen, with a scan reticle.
- A "Enter code manually" button under it — cameras fail, and this is the
  fallback that saves the night.

The result overlay is the whole product. It must be readable at arm's length:

- admitted — full-screen GREEN. Enormous "ADMITTED". Below it, in the largest
  text on the screen, the HOLDER NAME and PHONE NUMBER. Then the ticket code
  small. One "Next scan" button.
- already_used — full-screen RED. "ALREADY SCANNED". Holder name and phone.
  Then, prominently: the time it was first scanned and which staff member
  scanned it. This is the screenshot-sharing case and the staff member needs the
  evidence to argue with a student about it.
- not_found — full-screen RED. "NOT A VALID TICKET". Show the scanned code so it
  can be read out over the phone to an admin.
- voided — full-screen RED. "TICKET CANCELLED". Holder name.
- unpaid — full-screen AMBER. "PAYMENT NOT CONFIRMED". Holder name and a "Send
  to admin" button.

Do not rely on colour alone — each state also gets a distinct icon and distinct
text. Bouncers may be colour-blind and the screen may be washed out.

Offline behaviour, as UI only:
- On load, call getCheckInManifest() and cache the result in IndexedDB via idb.
  Show a "Ticket list downloaded — safe to go offline" confirmation.
- When offline, validate scans against the cache and queue the check-in locally.
  The result overlay looks identical but carries a small "queued — will sync"
  note.
- A visible queue depth in the top bar. If it's above zero when the operator
  tries to leave the page, warn them.
- // TODO(handoff): actual sync logic goes to syncQueuedCheckIns()

=== 3. STAFF LOGIN (src/pages/ScanLoginPage.tsx, route "/scan/login") ===
A single large PIN entry field. Build the UI only — no auth logic. Big number
pad, works with cold fingers and one hand.

=== 4. DEV STATE SWITCHER ===
Extend the existing dev panel to force every ScannerState and every
CheckInResult branch without needing a camera or a real code.

=== VERIFY ===
Confirm no page imports mock-data.ts directly. Paste back the full contents of
src/lib/data-access.ts. List every dependency in package.json. Confirm no
server, API, or backend file exists anywhere in the project.
```

**Verify:** force every scanner state via the dev switcher and look at each **at arm's length, screen brightness at 30%**. If you can't read the name from a metre away, the type is too small. This is the one screen where that test actually matters.

---

## 6. Handoff — twenty minutes, saves a day

Push to GitHub from AI Studio — **not a ZIP download**. Everything from here is versioned.

```bash
npm ls --depth=0
# delete anything not on the allowlist

ls -la                     # confirm NO server/, api/, or backend/ folder exists
grep -rn "GoogleGenerativeAI\|@google/generative-ai\|gemini" ./src
# zero hits. AI Studio wires in a model call unprompted if you let it.

grep -rn "fetch(\|axios\|localStorage\|sessionStorage\|process\.env\|supabase\|paystack" \
  --include=*.ts --include=*.tsx ./src
# expect zero hits outside data-access.ts stubs

grep -rn "TODO(handoff)" --include=*.ts --include=*.tsx ./src
# this is your work queue — read it

grep -rEn "#[0-9a-fA-F]{6}" --include=*.tsx ./src/pages ./src/components
# zero hits. every colour comes from config.

npm install && npm run build   # must pass clean before you proceed
```

**The migration you're paying for.** AI Studio gave you a React + Vite single-page app. Vite ships static files with an empty `<div id="root">` — WhatsApp's crawler reads that HTML, finds no title or image, and shows a bare link with no preview. Since WhatsApp is your entire distribution channel, that's not cosmetic. You also have nowhere to put the Paystack webhook, because a static site has no server.

So Session 1 opens by porting the same components into Next.js: `src/pages/*.tsx` become `app/*/page.tsx`, react-router routes become folders, and the contracts move to the repo root. The components themselves barely change — plain Tailwind and pure presentational components port almost cleanly, which is exactly why the prompts forbade shadcn and any router-specific logic inside components.

Budget **one full day**. It's the price of the free builder, and it's a fair trade — just don't discover it in week three.

---

## 7. `CLAUDE.md` — paste at repo root before the first session

````markdown
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
**holder's name and phone number** so staff can challenge identity. A green
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
- **Privacy:** the buyer list contains names, phone numbers and email addresses
  of ~300 identifiable students. It must be impossible to read any of it with
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
UI complete from Google AI Studio, currently React + Vite — **migrating to
Next.js is the first task of Session 1.** All data is mock, routed through
`lib/data-access.ts`. No database, no auth, no payments, no sync. Every gap is
marked `TODO(handoff)`.
````

---

## 8. Engineering sessions

### Session 1 — Audit, schema, payments end to end

```
Read CLAUDE.md first, then run:
grep -rn "TODO(handoff)" --include=*.ts --include=*.tsx .

This codebase was UI-generated in Google AI Studio as a React + Vite SPA. Your
job this session: migrate it to Next.js, then make a student able to actually
buy a ticket and receive a QR code. Work in this order.

=== STEP 0: MIGRATE VITE -> NEXT.JS 15 ===
Do this FIRST, before anything else. Layering schema work on top of the wrong
framework doubles the cost.

Why this migration is non-negotiable: the ticket link is distributed on
WhatsApp, whose crawler does not execute JavaScript. A Vite SPA serves an empty
root div, so the link preview is blank. We also need a server route for the
Paystack webhook, which a static site cannot provide.

- Scaffold Next.js 15 App Router + TypeScript + Tailwind in place.
- Move src/types/ticketing.ts -> types/ticketing.ts
  Move src/config/event.config.ts -> config/event.config.ts
  Move src/lib/* -> lib/*
  Keep the "@/*" import alias pointing at the repo root so imports still resolve.
- Convert react-router routes to App Router directories:
    /                    -> app/page.tsx
    /checkout            -> app/checkout/page.tsx
    /ticket/:reference   -> app/ticket/[reference]/page.tsx
    /admin               -> app/admin/page.tsx
    /scan                -> app/scan/page.tsx
    /scan/login          -> app/scan/login/page.tsx
- Replace useNavigate/useParams/Link with next/navigation and next/link.
- Add "use client" only where a component genuinely needs interactivity. The
  public event page should stay a server component so its metadata is
  server-rendered.
- Replace <img> with next/image, keeping the explicit dimensions already set.
- Remove react-router-dom and vite from package.json entirely.
- The COMPONENTS themselves should barely change. If you find yourself
  rewriting component internals, stop and tell me why.
- Run the build. It must pass clean before you continue to Step 1.
- Commit this migration on its own, separately from everything that follows.

=== STEP 1: AUDIT AND HARDEN ===
Now clean what's there, before adding anything.
- Run the build; fix every type error and warning.
- Delete any leftover Gemini API, server, or backend code AI Studio generated
  despite being told not to. Report anything you find.
- Find any component importing lib/mock-data.ts directly and route it through
  lib/data-access.ts.
- Find any hardcoded event-specific value outside event.config.ts and move it in.
- Verify /types/ticketing.ts matches what components actually use. Fix
  mismatches NOW, before the schema locks the shape in.
- Confirm all money handling uses integer kobo. Flag any float.
- Report what you found and fixed before continuing.

=== STEP 2: SCHEMA ===
Supabase migrations, matching /types/ticketing.ts exactly.

orders — id uuid pk, reference text UNIQUE NOT NULL, buyer_name, buyer_email,
buyer_phone, quantity int CHECK (quantity BETWEEN 1 AND 5),
unit_price_kobo int, service_charge_kobo int NOT NULL, fee_kobo int,
total_kobo int, status order_status enum,
paystack_channel text, raw_webhook jsonb, created_at, paid_at.

tickets — id uuid pk, order_id fk -> orders ON DELETE RESTRICT, code text UNIQUE
NOT NULL, holder_name, holder_phone, status ticket_status enum,
issued_at, checked_in_at, checked_in_by, checked_in_device.

check_ins — id uuid pk, ticket_id fk nullable, scanned_code text, result
check_in_result enum, staff_id, device_id, scanned_at, synced_at.
This table is an append-only audit log — no updates, no deletes.

staff_users — id uuid pk (references auth.users), name, role enum('admin','door').

event_settings — a single row, so these are enforced in the database and not
only in a config file:
  sales_open       boolean NOT NULL DEFAULT true  <- PRIMARY gate, admin-controlled
  capacity         integer NOT NULL              <- second gate
  sales_hard_stop  timestamptz                   <- BACKSTOP only, never primary
Gate order at checkout: sales_open -> hard stop -> capacity. Client-side
versions of these are advisory ONLY; the authoritative check must run inside
the same transaction that reserves capacity, or two concurrent buyers race
past the last ticket. Flipping sales_open is admin-role only and every flip
writes an audit row — closing sales stops all revenue, so "who closed it and
when" will be asked.

Indexes: tickets(code), orders(reference), orders(status), check_ins(ticket_id),
check_ins(scanned_at).

Ticket codes: format SGN-XXXX-XXXX using an unambiguous alphabet
(no 0/O/1/I/L). Generated server-side. They must NOT be sequential or guessable
— someone will try incrementing one.

SECURITY POLICIES — the buyer list is ~300 identifiable students' names, phone
numbers and email addresses, so this matters more than the usual:
- RLS ON for every table.
- anon: NO read access to orders, tickets, check_ins, or staff_users. None.
- anon: may read ONLY the aggregate sales counter, via a SECURITY DEFINER
  function returning counts — never rows.
- A buyer reaching /ticket/[reference] is served by a server component using the
  service role key, gated on the reference itself. The reference must be
  unguessable.
- authenticated role 'door': may read tickets (code, holder_name, holder_phone,
  status only) and insert into check_ins. holder_phone is the door's identity
  check so it must be readable, but the door role gets NO access to orders —
  buyer_email and the order's own contact details never reach a door phone.
  Prove this in the attack script for the door role, not just for anon.
- authenticated role 'admin': full read; writes only through defined functions.

After writing the policies, write a script that attempts, using ONLY the public
anon key, to (a) select from orders, (b) select from tickets, (c) enumerate
ticket codes. Confirm all three fail. Show me the output.

=== STEP 3: PAYSTACK ===
- POST /api/checkout — validates input server-side with the SAME zod schema the
  client uses; extract it to a shared module so there is exactly one definition.
- Compute total_kobo SERVER-SIDE via computeOrderTotals from the types file.
  Never trust a number sent by the client, and never recompute the arithmetic
  by hand — that function is the single definition.
- Check remaining capacity inside a transaction. Reject when sold out. Enforce
  sales_open and sales_hard_stop server-side too.
- When verifying the webhook amount, compare against computeOrderTotals(...)
  .totalKobo rather than recomputing, or the check rejects legitimate payments
  by a few kobo (see grossUpForPaystackFee).
- Create the order as 'pending', then call Paystack Initialize Transaction with
  that reference, and return the authorization_url.
- Rate-limit this endpoint per IP and per phone number.

- POST /api/webhooks/paystack — the money path. Get this exactly right:
  1. Verify the x-paystack-signature HMAC SHA512 over the RAW REQUEST BODY BYTES.
     Do NOT parse the JSON and re-stringify it before hashing — key order and
     whitespace will differ and the signature will not match. This is the single
     most common bug in Paystack integrations. Use the raw body.
  2. Return 200 immediately, then process. Paystack retries on non-200.
  3. IDEMPOTENT: the same reference arriving five times must create tickets
     exactly once. Enforce with a unique constraint plus an advisory lock, not
     with an application-level check.
  4. On charge.success: independently re-verify against the Verify Transaction
     endpoint before trusting the payload. Confirm the amount matches what we
     expect for that reference — reject and alert on mismatch.
  5. Mark the order paid, generate `quantity` tickets atomically in the same
     transaction. A partial write must be impossible.
  6. Store the full webhook payload in raw_webhook for reconciliation.
  7. Log and alert on any signature failure or amount mismatch.

- GET /checkout/callback — user returns from Paystack. Call Verify Transaction,
  and if the webhook hasn't landed yet, poll briefly before showing 'confirming'.
  The webhook is authoritative; this route only reads.

- A reconciliation script I can run: list every Paystack transaction for the
  period and diff it against the orders table. Report discrepancies. I need this
  before I hand anybody money back.

=== STEP 4: REAL DATA ACCESS ===
Replace every function body in /lib/data-access.ts with real queries.
Signatures must not change. Delete /lib/mock-data.ts. Confirm the build passes.

=== DONE WHEN ===
On Paystack test keys, from my phone, I can buy 2 tickets, get redirected to
Paystack, pay, land back on /ticket/[reference], and see 2 distinct scannable
QR codes — and /admin shows the order and updated totals. Then I fire the same
webhook payload 5 times with curl and still have exactly 2 tickets.

Commit in logical chunks with clear messages as you go.
```

### Session 2 — Auth, the scanner, offline sync, delivery

```
Read CLAUDE.md. Session 1 is complete — schema, security and payments work.
This session: make the door work, and close the loop with the buyer.

=== 1. AUTH ===
- Supabase Auth. Admin: email + password. Door staff: a shared-per-person PIN
  flow — wire the PIN login UI that already exists, don't redesign it.
- Middleware protecting /admin and /scan; unauthenticated redirects to login.
- Session duration long enough that staff are NOT logged out mid-event. Set it
  to 24 hours and say so in a comment with the reason.
- The service role key must never reach the client bundle. Verify this by
  grepping the built output and tell me how you verified it.

=== 2. THE SCANNER — the highest-stakes surface ===
- Camera via BarcodeDetector where available, @zxing/browser fallback for iOS
  Safari. Handle permission-denied with a clear recovery path.
- getCheckInManifest() returns the minimal manifest — code, holder_name,
  holder_phone, status — and nothing else. holder_phone is needed at the door
  and is denormalised onto tickets for exactly that reason; the orders table
  stays unreachable, so no buyer email or order history lands on a personal
  phone.
- Cache the manifest in IndexedDB on load. Show the "safe to go offline"
  confirmation only after the write actually completes.
- ONLINE scan: hit checkInTicket(). The server is authoritative. First scan
  wins — implement as a conditional UPDATE (SET status='checked_in' WHERE
  status='valid') and treat zero rows affected as already_used. Do not read-then-
  write; two doors will race.
- OFFLINE scan: validate against the IndexedDB manifest, mark it used LOCALLY so
  the same device can't pass the same code twice, queue the check-in, show the
  result with a "queued" indicator.
- syncQueuedCheckIns() on reconnect: server resolves conflicts by earliest
  scanned_at. If a queued scan turns out to be a duplicate, surface it clearly
  in an admin "conflicts" view — I need to know how many people got in on a
  shared code.
- Write a check_ins row for EVERY scan including rejections. It is the audit log.
- Manual code entry as a fallback path, going through the same validation.
- Realtime subscription so the admitted counter is live across all door devices
  when online.

CONSTRAINT: scan-to-result under 300ms with a warm cache. Measure it and report
the actual number.

KNOWN LIMITATION — tell me how you've handled it: two devices offline
simultaneously cannot detect a code used on the other. Minimise the window by
syncing aggressively whenever any connectivity appears, and make the conflicts
view prominent.

=== 3. TICKET DELIVERY ===
- Resend, fired after the webhook confirms payment. It must NOT block the
  webhook response. If sending fails, the order still succeeds and the buyer
  still sees success. Log failures; never surface them to the buyer.
- Email must render in Gmail on Android: inline styles, table layout, no modern
  CSS, under 100KB. The QR goes in as an embedded image AND as a link to the
  ticket page, because image blocking is common.
- "Save ticket as image" — render the ticket card to PNG client-side. This is
  the primary delivery path in practice; students save it to their gallery and
  send it on WhatsApp. Make it work on Android Chrome specifically and confirm
  the downloaded file actually scans.
- "Rename this ticket" — gated on featureFlags.allowNameChange, closes at
  sales_close_at, rate-limited, and every rename written to an audit log.

=== 4. ADMIN, LIVE ===
- Wire every remaining data-access function.
- Realtime on the dashboard stats.
- CSV export from real data.
- Void ticket, issue complimentary ticket, resend ticket email.
- A conflicts view for offline sync collisions.

=== DONE WHEN ===
I can: log in as door staff on a second phone, load the manifest, put the phone
in AIRPLANE MODE, scan a ticket, see ADMITTED with the holder's name and phone
number, scan the same ticket again and see ALREADY SCANNED, turn data back on,
watch the queue flush to zero, and see both events in the admin check-in log.
```

### Session 3 — Performance, sharing, launch

```
Read CLAUDE.md. Sessions 1 and 2 are complete. Final session: make it fast,
make it shareable, ship it.

=== 1. PERFORMANCE ===
Target: public page LCP under 2.5s on Slow 4G with 4x CPU throttle.
Measure and report ACTUAL numbers — do not assert.
- Bundle analysis. Report total client JS in KB.
- Hero image in AVIF/WebP, under 150KB, explicit dimensions. Report CLS.
- Dynamically import @zxing/browser so it loads only on /scan.
- Self-host and subset fonts.
- Report scan-to-result latency with a warm cache.

=== 2. SHARING METADATA — high priority, this link lives on WhatsApp ===
- Complete OG and Twitter tags, SERVER-RENDERED. WhatsApp's crawler does not
  execute JavaScript, so they must be in the initial HTML.
- OG image at 1200x630, sourced from config, **under 300KB** — WhatsApp silently
  drops previews on larger files with no error. Report the byte size.
- The /ticket/[reference] route must be noindex.
- Favicon and touch icons.

=== 3. ACCESSIBILITY ===
- axe-core, zero critical issues.
- Report actual contrast ratios for: hero text on hero image, the accent CTA,
  and every scanner result state.
- Scanner states distinguishable without colour — confirm icon + text differ.
- Keyboard reachable with visible focus rings; one h1; errors with role="alert".

=== 4. ERROR HANDLING ===
- Custom 404 in the event's style, with a route back.
- Error boundary with the WhatsApp support link as the human fallback.
- If Paystack is unreachable at checkout, show the error plus the WhatsApp
  number. Never a dead end — that's a lost sale and an angry message to me.
- /api/health returning db and Paystack reachability.

=== 5. REUSE PREP ===
This build gets used again for the next faculty's event, so treat the config as
a product asset:
- Audit for ANY event-specific string, colour, price, date, or asset path
  outside event.config.ts. Move every one in.
- Write README.md documenting exactly which files change for a new event, and a
  realistic time estimate for the swap.

=== 6. DEPLOY ===
- Deploy to Vercel. Production env vars set. Live Paystack keys.
- Register the production webhook URL in the Paystack dashboard and confirm it
  receives a test event.
- Custom domain + DNS.
- Produce a launch checklist covering: switching test->live keys, verifying RLS
  in production, testing the WhatsApp link preview, and a rollback plan.

=== REPORT AT THE END ===
LCP, total client JS in KB, CLS, scan-to-result latency, OG image byte size,
every contrast ratio requested, and how you verified the service role key is
not in the client bundle.
```

---

## 9. Manual QA — you run this, not the agent

"Done" is a claim, not a state. Every one of these is a real-world condition, not a synthetic one.

| Check | How |
|---|---|
| **WhatsApp preview** | Send the URL to yourself on WhatsApp. If no image renders, the OG image is too big or the tags aren't server-rendered. |
| **Real device** | The cheapest Android in your circle, on mobile data, not wifi. Buy a ticket start to finish. |
| **Money, five times** | Fire the same webhook payload 5× with curl. Exactly N tickets, never N×5. |
| **Amount tampering** | Change the amount in a webhook payload. It must be rejected and logged. |
| **Screenshot attack** | Screenshot a valid ticket, send it to a friend, have them present it after you've scanned yours. Must show ALREADY SCANNED with your name and the first-scan time. |
| **Airplane mode** | Load the manifest, kill data, scan 5 tickets, restore data, confirm the queue flushes and admin shows all 5. |
| **Two doors racing** | Two phones, both online, scan the same code within a second. Exactly one ADMITTED. |
| **Arm's length test** | Screen at 30% brightness, phone at a metre. Can you read the holder's name? If not, the type is too small. |
| **Sold out** | Set capacity to sold+1 in the database, buy the last ticket, confirm the next attempt sees the sold-out state and no order row is created. |
| **Sales closed** | Set `sales_close_at` to the past. Checkout must refuse server-side, not just hide the button. |
| **Data leak** | Open the browser console on the public page and try to select from `orders` with the anon key. Must fail. |
| **Reconciliation** | Run the reconciliation script against Paystack. Zero discrepancies. |
| **Reuse proof** | Swap `event.config.ts` for a fake second event. Nothing should break. |

---

## 10. Timeline — 18 days, with the buffer named

| Days | Work | Blocking |
|---|---|---|
| **0** | Paystack tier check + upgrade started. Supabase, Resend, Vercel, domain, repo. | **Start today.** Compliance approval is the long pole. |
| 1–2 | Gather Phase 0 facts and assets. Write the three contract files by hand. | Needs the event facts and the real capacity number |
| 3–5 | AI Studio prompts 1–3, verify after each | |
| 6 | Handoff audit, GitHub push, `CLAUDE.md` written | |
| 7 | **Session 1 Step 0 — Vite → Next.js migration.** Its own day. | The cost of using the free builder |
| 8–10 | Session 1 — schema, RLS, Paystack, end to end on test keys | Blocked on Paystack test keys (available immediately) |
| 11–13 | Session 2 — auth, scanner, offline sync, delivery | |
| 14–15 | Session 3 — performance, OG, deploy | Blocked on **live** Paystack keys |
| 16 | **Soft launch** — sell 10 real tickets to your exec team at the real price | |
| 17–18 | Manual QA in full. Fix what it finds. | |
| 19+ | Public launch. Buffer. | |

The migration pushed everything one day right. If that day matters more to you than the ~$20 for v0, switch builders and delete Step 0 — nothing else in the plan changes.

**Sell to your own exec team on day 15 at the real price with live keys.** Ten real transactions will find things no test key ever will — and if something's broken you're refunding ten friends, not four hundred strangers.

---

## 11. Things worth saying plainly

**The config file is a business asset, not housekeeping.** Every faculty at UNILAG runs a sign-out. Every department runs a dinner. If `event.config.ts` genuinely holds everything instance-specific, your second event is a two-hour deployment and a real FlagIQ product line. If you let hardcoded strings leak into components during week two, it's a rebuild every time. That discipline is worth more than any feature in this plan.

**Scope creep will arrive around day 10** wearing the costume of a good idea — a referral system, table bookings, a leaderboard, an afterparty upsell. The answer is no. Ship the thing on the date.

**Your biggest operational risk isn't technical, it's the door.** Budget an hour before doors open to load the manifest on every scanner phone, confirm each one works offline, and walk the staff through the ALREADY SCANNED screen so they know what to say. A bouncer who doesn't know what to do with a red screen is a worse failure than a bug.

**You are holding students' money for weeks before delivering.** Write the refund policy before you take the first naira, publish it on the page, and keep the reconciliation script working. If the event moves or gets cancelled, that policy is the only thing standing between you and a very bad WhatsApp group.

---

**Sources:** [Paystack transaction pricing](https://support.paystack.com/en/articles/2130306) · [Paystack Starter Businesses](https://paystack.com/blog/product/paystack-starter-businesses) · [Paystack Nigeria compliance requirements](https://support.paystack.com/en/articles/2123970) · [Paystack Accept Payments docs](https://paystack.com/docs/payments/accept-payments/) · [Paystack Webhooks docs](https://paystack.com/docs/payments/webhooks/) · [Paystack Verify Payments docs](https://paystack.com/docs/payments/verify-payments/)
