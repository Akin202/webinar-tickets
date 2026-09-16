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

/**
 * Who the buyer is. The Summit is a deliberately mixed room, and this is the
 * segmentation that makes post-event follow-up worth anything. The tuple is
 * the single definition: the zod schemas and the SQL enum are pinned to it
 * (tests/migration-invariants.test.ts).
 */
export const ATTENDEE_TYPES = ['student', 'professional', 'founder'] as const;
export type AttendeeType = (typeof ATTENDEE_TYPES)[number];

/**
 * Ticket code shape: PREFIX-XXXX-XXXX over an unambiguous alphabet (no 0/O/1/I),
 * because codes get read aloud at the door. The SQL check constraint and
 * private.generate_ticket_code() carry the same prefix; the invariant tests
 * fail if they drift. Unanchored on purpose — a QR may hold a full ticket URL.
 */
export const TICKET_CODE_PREFIX = 'FIQ';
export const TICKET_CODE_PATTERN = /FIQ-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}/;

/** A purchase. One order may contain several tickets. */
export interface Order {
  id: string;                    // uuid
  reference: string;             // Paystack transaction reference — unique
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;            // normalised to +234XXXXXXXXXX
  /** Required for every paying buyer. Null only on an admin-issued
   *  complimentary ticket (all money columns zero) — enforced by a CHECK. */
  attendeeType: AttendeeType | null;
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
  code: string;                  // human-readable, e.g. "FIQ-7K2Q-9XM4". Goes in the QR.
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
  grossKobo: number;             // total collected from buyers
  gatewayFeesKobo: number;       // Paystack's cut
  serviceChargeKobo: number;     // FlagIQ's cut — what they are owed
  netKobo: number;               // gross − gatewayFees − serviceCharge = organiser's take
  ordersPending: number;
  isSoldOut: boolean;
  salesClosed: boolean;
  currentPriceKobo: number;
  byChannel: Record<string, number>;
  lastUpdatedAt: string;
}

/**
 * The ONLY sales figures safe to expose to an unauthenticated visitor.
 *
 * Deliberately carries no money and no per-channel breakdown: the public
 * event page and checkout are served with the anon key, which ships in the
 * browser bundle, so anything reachable here is effectively published.
 * SalesSummary — which holds gross, net, service charge and gateway fees —
 * is admin-only and must never be fetched from an anon-reachable surface.
 *
 * Backed by a SECURITY DEFINER aggregate returning counts, never rows.
 */
export interface PublicSalesCounter {
  capacity: number;
  ticketsSold: number;
  ticketsRemaining: number;
  ticketsCheckedIn: number;
  isSoldOut: boolean;
  salesClosed: boolean;
  currentPriceKobo: number;
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

/**
 * Inverse of paystackFeeKobo: the smallest amount T we can charge such that
 * T − fee(T) still leaves `subtotalKobo` behind.
 *
 * Needed because Paystack takes its percentage of the TOTAL charged, including
 * any fee we add on top. Charging `subtotal + fee(subtotal)` therefore
 * under-recovers: on a single ₦3,000 ticket the buyer is undercharged ₦2.26
 * and ₦2.23 of that fails to reach the organiser (the ₦0.03 difference is the
 * gateway fee on the shortfall itself). ~₦669 unrecovered across 300 orders.
 *
 * Iterative rather than closed-form on purpose: the ₦2,500 flat-fee threshold
 * and the ₦2,000 cap make any single formula wrong at the boundaries. Bounded
 * and cheap — the gap is a few hundred kobo at realistic ticket prices.
 *
 * LANDS EXACTLY, never past the target. `t - fee(t)` is non-decreasing and
 * rises by at most 1 per kobo step, and the seed `sub + fee(sub)` never
 * overshoots, so the first t satisfying the condition satisfies it with
 * equality. That exactness is what the residual identity below relies on.
 */
export function grossUpForPaystackFee(subtotalKobo: number): number {
  if (subtotalKobo <= 0) return 0;
  let total = subtotalKobo + paystackFeeKobo(subtotalKobo);
  while (total - paystackFeeKobo(total) < subtotalKobo) total += 1;
  return total;
}

/** Full money breakdown for an order. Every field integer kobo. */
export interface OrderTotals {
  quantity: number;
  unitPriceKobo: number;
  baseKobo: number;           // what the organiser keeps, before anything
  serviceChargeKobo: number;  // FlagIQ's cut
  subtotalKobo: number;       // base + serviceCharge
  gatewayFeeKobo: number;     // Paystack's cut
  totalKobo: number;          // what the buyer is actually charged
}

/**
 * THE one definition of what an order costs. Both the checkout UI and (from
 * Session 1) the server must call this — the build plan is explicit that the
 * client never decides an amount, so having two implementations that drift is
 * the failure mode this exists to prevent.
 *
 * Invariant, which the tests assert:
 *   totalKobo − gatewayFeeKobo − serviceChargeKobo === baseKobo
 *
 * RESIDUAL IDENTITY — how to tell, from a stored order alone, whether the
 * buyer covered the gateway fee. Needed by reconciliation if passFeeToBuyer
 * is ever flipped mid-sale, since orders either side of the flip have
 * different economics:
 *
 *   residual = totalKobo − (unitPriceKobo × quantity) − serviceChargeKobo
 *   residual === feeKobo  ->  buyer paid the fee
 *   residual === 0        ->  organiser absorbed it
 *
 * Use strict equality, not `residual > 0`: the strict test also catches a
 * corrupt row, where the loose one would silently report pass-mode. Verified
 * exhaustively across unit prices either side of the ₦2,500 threshold,
 * quantities 1-10, service rates 0/7.5/10%, and amounts reaching the ₦2,000
 * fee cap — 420/420 cases, zero mismatches.
 *
 * This is why there is deliberately NO `feePassedToBuyer` column on Order:
 * the mode is already recoverable, so the field would be redundancy rather
 * than capability. The matching migration comment says the same. Do not add
 * it without a reason that survives this derivation.
 */
export function computeOrderTotals(input: {
  quantity: number;
  unitPriceKobo: number;
  serviceChargeRate: number;
  passFeeToBuyer: boolean;
}): OrderTotals {
  const { quantity, unitPriceKobo, serviceChargeRate, passFeeToBuyer } = input;

  const baseKobo = unitPriceKobo * quantity;
  const serviceChargeKobo = Math.round(baseKobo * serviceChargeRate);
  const subtotalKobo = baseKobo + serviceChargeKobo;

  // When the buyer covers the gateway fee we must gross up, so the organiser
  // is left with exactly `subtotalKobo`. When we absorb it, the buyer pays the
  // subtotal and Paystack's cut comes out of our side.
  const totalKobo = passFeeToBuyer
    ? grossUpForPaystackFee(subtotalKobo)
    : subtotalKobo;
  const gatewayFeeKobo = paystackFeeKobo(totalKobo);

  return {
    quantity,
    unitPriceKobo,
    baseKobo,
    serviceChargeKobo,
    subtotalKobo,
    gatewayFeeKobo,
    totalKobo,
  };
}

export function normaliseNgPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
}

/** Door-legible grouping: "+2348023456789" -> "+234 802 345 6789".
 *  Display only — never store or compare the grouped form. Falls back to the
 *  input untouched so an unexpected shape still renders something at the door
 *  rather than nothing. */
export function formatPhoneForDisplay(phone: string): string {
  const match = phone.match(/^\+234(\d{3})(\d{3})(\d{4})$/);
  if (!match) return phone;
  return `+234 ${match[1]} ${match[2]} ${match[3]}`;
}

export interface CheckoutValues {
  fullName: string;
  email: string;
  phone: string;
  attendeeType: AttendeeType;
  quantity: number;
  marketingOptIn: boolean;
}

export type EmailCampaignKind = 'essential' | 'marketing';
export type EmailCampaignAudience = 'all_paid' | 'checked_in' | 'not_checked_in';
export type EmailCampaignStatus =
  | 'draft'
  | 'sending'
  | 'completed'
  | 'completed_with_failures'
  | 'failed';

export interface EmailCampaign {
  id: string;
  kind: EmailCampaignKind;
  audience: EmailCampaignAudience;
  subject: string;
  message: string;
  status: EmailCampaignStatus;
  targetedCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
