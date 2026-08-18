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
  buyerMatricNumber: string | null;
  quantity: number;
  unitPriceKobo: number;         // ALL money in kobo. Never floats.
  feeKobo: number;               // Paystack fee, if passed to buyer
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
  holderMatricNumber: string | null;
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

export function normaliseNgPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
}

export interface CheckoutValues {
  fullName: string;
  email: string;
  phone: string;
  matricNumber?: string;
  department?: string;
  quantity: number;
}
