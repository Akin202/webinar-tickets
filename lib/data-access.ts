import type {
  Order,
  Ticket,
  CheckIn,
  CheckInResult,
  SalesSummary,
  PublicSalesCounter,
  StaffUser,
} from '@/types/ticketing';
import { computeOrderTotals } from '@/types/ticketing';
import { eventConfig } from '@/config/event.config';
import {
  mockSalesSummary as initialSalesSummary,
  mockOrders as initialOrders,
  mockTickets as initialTickets,
  mockCheckIns as initialCheckIns,
  mockStaffUser,
} from '@/lib/mock-data';

// ============================================================
// CONTRACT — the ONLY boundary between UI and data.
// Components import from here and nowhere else.
// TODO(handoff): every function below returns mock data. Each carries its
//   own marker describing what the real implementation must do.
// Signatures must NOT change — components depend on them.
// ============================================================

let currentOrders: Order[] = [...initialOrders];
let currentTickets: Ticket[] = [...initialTickets];
let currentCheckIns: CheckIn[] = [...initialCheckIns];
let currentStaffUser: StaffUser | null = { ...mockStaffUser };

// Mirrors the single-row `event_settings.sales_open` the schema will own.
// In-memory here so the admin toggle is demonstrable before the DB exists.
let salesOpen: boolean = eventConfig.ticketing.salesOpen;

/** Backstop only — see event.config.ts. Never the primary gate. */
function pastHardStop(): boolean {
  return Date.now() > new Date(eventConfig.ticketing.salesHardStopAt).getTime();
}

const delay = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));

// TODO(handoff): Replace with a SECURITY DEFINER aggregate function. anon
//   must get counts only, never rows.
export async function getSalesSummary(): Promise<SalesSummary> {
  await delay(150);
  const sold = currentTickets.filter((t) => t.status !== 'void').length;
  const checkedIn = currentTickets.filter((t) => t.status === 'checked_in').length;
  const capacity = eventConfig.ticketing.capacity;
  const paidOrders = currentOrders.filter((o) => o.status === 'paid');
  const grossKobo = paidOrders.reduce((sum, o) => sum + o.totalKobo, 0);
  const gatewayFeesKobo = paidOrders.reduce((sum, o) => sum + o.feeKobo, 0);
  const serviceChargeKobo = paidOrders.reduce((sum, o) => sum + o.serviceChargeKobo, 0);
  // What the organiser actually keeps, not an estimate.
  const netKobo = grossKobo - gatewayFeesKobo - serviceChargeKobo;
  const pending = currentOrders.filter((o) => o.status === 'pending').length;

  return {
    capacity,
    ticketsSold: sold,
    ticketsRemaining: Math.max(0, capacity - sold),
    ticketsCheckedIn: checkedIn,
    grossKobo,
    gatewayFeesKobo,
    serviceChargeKobo,
    netKobo,
    ordersPending: pending,
    isSoldOut: sold >= capacity,
    salesClosed: !salesOpen || pastHardStop(),
    byChannel: {
      card: currentOrders.filter((o) => o.paystackChannel === 'card').length,
      bank_transfer: currentOrders.filter((o) => o.paystackChannel === 'bank_transfer').length,
      ussd: currentOrders.filter((o) => o.paystackChannel === 'ussd').length,
    },
    lastUpdatedAt: new Date().toISOString(),
  };
}

// TODO(handoff): back with a SECURITY DEFINER RPC granted to anon, returning
//   COUNTS ONLY and never rows. This is the one sales figure an unauthenticated
//   visitor may read. Do NOT let it grow money fields — getSalesSummary exists
//   for that and is admin-only, served with the service role key.
export async function getPublicSalesCounter(): Promise<PublicSalesCounter> {
  await delay(150);
  const sold = currentTickets.filter((t) => t.status !== 'void').length;
  const checkedIn = currentTickets.filter((t) => t.status === 'checked_in').length;
  const capacity = eventConfig.ticketing.capacity;

  return {
    capacity,
    ticketsSold: sold,
    ticketsRemaining: Math.max(0, capacity - sold),
    ticketsCheckedIn: checkedIn,
    isSoldOut: sold >= capacity,
    salesClosed: !salesOpen || pastHardStop(),
    lastUpdatedAt: new Date().toISOString(),
  };
}

// TODO(handoff): ADMIN ONLY. Contains gross, net, service charge and gateway
//   fees. Must be served server-side with the service role key and must never
//   be reachable from /, /checkout or /scan — use getPublicSalesCounter there.
// TODO(handoff): persist to the single-row `event_settings.sales_open`.
//   Admin role only, and every flip should be written to an audit log —
//   closing sales stops all revenue, so "who closed it and when" matters.
export async function setSalesOpen(open: boolean): Promise<void> {
  await delay(150);
  salesOpen = open;
}

// TODO(handoff): Replace with POST /api/checkout. Compute total_kobo
//   SERVER-SIDE from event_settings; never trust a client amount. Check
//   capacity and sales_close_at inside a transaction. Rate-limit per IP and
//   per phone.
export async function initiatePurchase(input: {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  quantity: number;
}): Promise<{ authorizationUrl: string; reference: string }> {
  await delay(200);

  // Gate order matches what the server must enforce in Session 1: the admin
  // switch, then the backstop, then capacity. All three are advisory here —
  // a client-side check stops an honest mistake, not an attacker.
  if (!salesOpen) throw new Error('Ticket sales are currently closed.');
  if (pastHardStop()) throw new Error('Ticket sales have ended.');
  const soldCount = currentTickets.filter((t) => t.status !== 'void').length;
  if (soldCount + input.quantity > eventConfig.ticketing.capacity) {
    throw new Error('Not enough tickets remaining.');
  }

  const randRef = `ENG26-TX-${Math.floor(100000 + Math.random() * 900000)}`;
  const orderId = `ord_live_${Date.now()}`;
  const unitPriceKobo = eventConfig.ticketing.priceKobo;
  const totals = computeOrderTotals({
    quantity: input.quantity,
    unitPriceKobo,
    serviceChargeRate: eventConfig.ticketing.serviceChargeRate,
    passFeeToBuyer: eventConfig.ticketing.passFeeToBuyer,
  });

  const newOrder: Order = {
    id: orderId,
    reference: randRef,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    buyerPhone: input.buyerPhone,
    quantity: input.quantity,
    unitPriceKobo,
    serviceChargeKobo: totals.serviceChargeKobo,
    feeKobo: totals.gatewayFeeKobo,
    totalKobo: totals.totalKobo,
    status: 'paid',
    paystackChannel: 'card',
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
  };

  const newTickets: Ticket[] = [];
  for (let i = 0; i < input.quantity; i++) {
    const letter = String.fromCharCode(65 + i);
    const code = `SGN-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${randRef.replace('ENG26-TX-', '')}-${letter}`;
    newTickets.push({
      id: `tkt_${Date.now()}_${i}`,
      orderId,
      code,
      holderName: input.buyerName,
      holderPhone: input.buyerPhone,
      status: 'valid',
      issuedAt: new Date().toISOString(),
      checkedInAt: null,
      checkedInBy: null,
      checkedInDevice: null,
    });
  }

  currentOrders.unshift(newOrder);
  currentTickets.unshift(...newTickets);

  return {
    authorizationUrl: `/ticket/${randRef}`,
    reference: randRef,
  };
}

// TODO(handoff): Read-only verify against Paystack. The webhook is
//   authoritative - this must never mark an order paid.
export async function confirmPurchase(
  reference: string
): Promise<{ order: Order; tickets: Ticket[] }> {
  await delay(200);
  const order = currentOrders.find((o) => o.reference.toUpperCase() === reference.toUpperCase());
  if (!order) {
    throw new Error('Order reference not found');
  }
  const tickets = currentTickets.filter((t) => t.orderId === order.id);
  return { order, tickets };
}

// TODO(handoff): Server-side lookup. Door role may read code, holder_name,
//   holder_phone and status ONLY.
export async function getTicketByCode(code: string): Promise<Ticket | null> {
  await delay(150);
  const clean = code.trim().toUpperCase();
  const ticket = currentTickets.find((t) => t.code.toUpperCase() === clean);
  return ticket ? { ...ticket } : null;
}

// TODO(handoff): Server component using the service role key, gated on an
//   unguessable reference.
export async function getOrderByReference(reference: string): Promise<{
  order: Order;
  tickets: Ticket[];
} | null> {
  await delay(150);
  const order = currentOrders.find(
    (o) => o.reference.trim().toUpperCase() === reference.trim().toUpperCase()
  );
  if (!order) return null;
  const tickets = currentTickets.filter((t) => t.orderId === order.id);
  return { order: { ...order }, tickets: [...tickets] };
}

// TODO(handoff): Gate on featureFlags.allowNameChange, close at
//   sales_close_at, rate-limit, and write every rename to an audit log.
// holderPhone is deliberately not a parameter: it is the door's identity
// check, so the holder must not be able to rewrite it.
export async function renameTicketHolder(
  ticketId: string,
  holderName: string
): Promise<void> {
  await delay(200);
  const ticket = currentTickets.find((t) => t.id === ticketId);
  if (!ticket) throw new Error('Ticket not found');
  ticket.holderName = holderName.trim();
}

// ---- Door / scanner ----
// TODO(handoff): Return the MINIMAL manifest only - code, holder_name,
//   holder_phone, status. holder_phone is the door's identity check so it
//   has to ship; buyer email and every money column must never reach a
//   door phone.
export async function getCheckInManifest(): Promise<Ticket[]> {
  await delay(200);
  return [...currentTickets];
}

// TODO(handoff): First scan wins. Implement as a conditional UPDATE (SET
//   status='checked_in' WHERE status='valid') and treat zero rows affected as
//   already_used. Do NOT read-then-write - two doors will race.
export async function checkInTicket(input: {
  code: string;
  staffId: string;
  deviceId: string;
  scannedAt: string;
}): Promise<CheckInResult> {
  await delay(150);
  const clean = input.code.trim().toUpperCase();
  const ticket = currentTickets.find((t) => t.code.toUpperCase() === clean);

  if (!ticket) {
    const rejectedCheckIn: CheckIn = {
      id: `chk_${Date.now()}`,
      ticketId: null,
      scannedCode: clean,
      result: 'not_found',
      staffId: input.staffId,
      deviceId: input.deviceId,
      scannedAt: input.scannedAt,
      syncedAt: new Date().toISOString(),
    };
    currentCheckIns.unshift(rejectedCheckIn);
    return { kind: 'not_found', scannedCode: clean };
  }

  const order = currentOrders.find((o) => o.id === ticket.orderId);
  if (order && order.status !== 'paid') {
    const unpaidCheckIn: CheckIn = {
      id: `chk_${Date.now()}`,
      ticketId: ticket.id,
      scannedCode: clean,
      result: 'unpaid',
      staffId: input.staffId,
      deviceId: input.deviceId,
      scannedAt: input.scannedAt,
      syncedAt: new Date().toISOString(),
    };
    currentCheckIns.unshift(unpaidCheckIn);
    return { kind: 'unpaid', ticket };
  }

  if (ticket.status === 'void') {
    const voidedCheckIn: CheckIn = {
      id: `chk_${Date.now()}`,
      ticketId: ticket.id,
      scannedCode: clean,
      result: 'voided',
      staffId: input.staffId,
      deviceId: input.deviceId,
      scannedAt: input.scannedAt,
      syncedAt: new Date().toISOString(),
    };
    currentCheckIns.unshift(voidedCheckIn);
    return { kind: 'voided', ticket };
  }

  if (ticket.status === 'checked_in') {
    const priorCheckIn = currentCheckIns.find((c) => c.ticketId === ticket.id && c.result === 'admitted');
    const alreadyUsedCheckIn: CheckIn = {
      id: `chk_${Date.now()}`,
      ticketId: ticket.id,
      scannedCode: clean,
      result: 'already_used',
      staffId: input.staffId,
      deviceId: input.deviceId,
      scannedAt: input.scannedAt,
      syncedAt: new Date().toISOString(),
    };
    currentCheckIns.unshift(alreadyUsedCheckIn);
    return {
      kind: 'already_used',
      ticket,
      firstScannedAt: priorCheckIn?.scannedAt || ticket.checkedInAt || new Date().toISOString(),
      firstScannedBy: priorCheckIn?.staffId || 'Staff Door Lead',
    };
  }

  // Admitted
  ticket.status = 'checked_in';
  ticket.checkedInAt = input.scannedAt;
  ticket.checkedInBy = input.staffId;
  ticket.checkedInDevice = input.deviceId;

  const validCheckIn: CheckIn = {
    id: `chk_${Date.now()}`,
    ticketId: ticket.id,
    scannedCode: clean,
    result: 'admitted',
    staffId: input.staffId,
    deviceId: input.deviceId,
    scannedAt: input.scannedAt,
    syncedAt: new Date().toISOString(),
  };
  currentCheckIns.unshift(validCheckIn);

  const totalAdmitted = currentTickets.filter((t) => t.status === 'checked_in').length;
  return {
    kind: 'admitted',
    ticket,
    admittedCount: totalAdmitted,
  };
}

// TODO(handoff): Server resolves conflicts by earliest scanned_at. Surface
//   duplicates in the admin conflicts view.
export async function syncQueuedCheckIns(
  queued: Array<{ code: string; staffId: string; deviceId: string; scannedAt: string }>
): Promise<CheckInResult[]> {
  await delay(250);
  const results: CheckInResult[] = [];
  for (const item of queued) {
    const res = await checkInTicket(item);
    results.push(res);
  }
  return results;
}

// ---- Admin ----
// TODO(handoff): Admin role only. Paginate server-side.
export async function listOrders(opts?: {
  status?: Order['status'];
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<{ orders: Order[]; total: number }> {
  await delay(180);
  let filtered = [...currentOrders];

  if (opts?.status) {
    filtered = filtered.filter((o) => o.status === opts.status);
  }

  if (opts?.query && opts.query.trim()) {
    const q = opts.query.toLowerCase().trim();
    filtered = filtered.filter(
      (o) =>
        o.reference.toLowerCase().includes(q) ||
        o.buyerName.toLowerCase().includes(q) ||
        o.buyerPhone.includes(q)
    );
  }

  const offset = opts?.offset || 0;
  const limit = opts?.limit || 50;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    orders: paginated,
    total: filtered.length,
  };
}

// TODO(handoff): Admin role only.
export async function listTickets(opts?: {
  status?: Ticket['status'];
  query?: string;
}): Promise<Ticket[]> {
  await delay(180);
  let filtered = [...currentTickets];

  if (opts?.status) {
    filtered = filtered.filter((t) => t.status === opts.status);
  }

  if (opts?.query && opts.query.trim()) {
    const q = opts.query.toLowerCase().trim();
    filtered = filtered.filter(
      (t) =>
        t.code.toLowerCase().includes(q) ||
        t.holderName.toLowerCase().includes(q) ||
        (t.holderPhone !== null && t.holderPhone.includes(q))
    );
  }

  return filtered;
}

// TODO(handoff): Admin only. Append to the check_ins audit log; never
//   hard-delete.
export async function voidTicket(ticketId: string, reason: string): Promise<void> {
  await delay(150);
  const ticket = currentTickets.find((t) => t.id === ticketId);
  if (ticket) {
    ticket.status = 'void';
  }
}

// TODO(handoff): Admin only. Must count against capacity like any other
//   ticket.
export async function issueComplimentaryTicket(input: {
  holderName: string;
  holderPhone: string | null;
}): Promise<Ticket> {
  await delay(200);
  const randNum = Math.floor(100000 + Math.random() * 900000);
  const orderId = `ord_comp_${Date.now()}`;
  const code = `SGN-VIP-${randNum}-A`;

  const newTicket: Ticket = {
    id: `tkt_comp_${Date.now()}`,
    orderId,
    code,
    holderName: input.holderName,
    holderPhone: input.holderPhone,
    status: 'valid',
    issuedAt: new Date().toISOString(),
    checkedInAt: null,
    checkedInBy: null,
    checkedInDevice: null,
  };

  const newOrder: Order = {
    id: orderId,
    reference: `ENG26-VIP-${randNum}`,
    buyerName: input.holderName,
    buyerEmail: 'comp@example.com',
    buyerPhone: input.holderPhone || '+2348000000000',
    quantity: 1,
    // Complimentary: no money changes hands, so no gateway fee and no
    // service charge. It still counts against capacity.
    unitPriceKobo: 0,
    serviceChargeKobo: 0,
    feeKobo: 0,
    totalKobo: 0,
    status: 'paid',
    paystackChannel: 'card',
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
  };

  currentOrders.unshift(newOrder);
  currentTickets.unshift(newTicket);

  return newTicket;
}

// TODO(handoff): Admin only. This is ~400 identifiable people's names, email
//   addresses and phone numbers - log every export.
export async function exportOrdersCsv(): Promise<string> {
  await delay(150);
  const headers = ['Order Reference', 'Buyer Name', 'Email', 'Phone', 'Quantity', 'Total NGN', 'Status', 'Date'];
  const rows = currentOrders.map((o) => [
    o.reference,
    `"${o.buyerName}"`,
    o.buyerEmail,
    o.buyerPhone,
    o.quantity,
    o.totalKobo / 100,
    o.status,
    o.createdAt,
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

// TODO(handoff): Read from the Supabase Auth session, not from client state.
export async function getCurrentStaffUser(): Promise<StaffUser | null> {
  await delay(100);
  return currentStaffUser ? { ...currentStaffUser } : null;
}
