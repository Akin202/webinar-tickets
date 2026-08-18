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
  grossKobo: number;             // total collected from buyers
  gatewayFeesKobo: number;       // Paystack's cut
  serviceChargeKobo: number;     // FlagIQ's cut — what they are owed
  netKobo: number;               // gross − gatewayFees − serviceCharge = organiser's take
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

/**
 * Inverse of paystackFeeKobo: the smallest amount T we can charge such that
 * T − fee(T) still leaves `subtotalKobo` behind.
 *
 * Needed because Paystack takes its percentage of the TOTAL charged, including
 * any fee we add on top. Charging `subtotal + fee(subtotal)` therefore
 * under-recovers — ₦2.23 on a single ₦3,000 ticket, ~₦669 across 300 orders.
 *
 * Iterative rather than closed-form on purpose: the ₦2,500 flat-fee threshold
 * and the ₦2,000 cap make any single formula wrong at the boundaries. Bounded
 * and cheap — the gap is a few hundred kobo at realistic ticket prices.
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
  quantity: number;
}
