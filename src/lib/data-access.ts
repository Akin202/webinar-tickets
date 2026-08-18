import type {
  Order,
  Ticket,
  CheckIn,
  CheckInResult,
  SalesSummary,
  StaffUser,
} from '@/types/ticketing';
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
// TODO(handoff): replace every body with real queries.
// Signatures must NOT change — components depend on them.
// ============================================================

let currentOrders: Order[] = [...initialOrders];
let currentTickets: Ticket[] = [...initialTickets];
let currentCheckIns: CheckIn[] = [...initialCheckIns];
let currentStaffUser: StaffUser | null = { ...mockStaffUser };

const delay = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getSalesSummary(): Promise<SalesSummary> {
  await delay(150);
  const sold = currentTickets.filter((t) => t.status !== 'void').length;
  const checkedIn = currentTickets.filter((t) => t.status === 'checked_in').length;
  const capacity = eventConfig.ticketing.capacity;
  const grossKobo = currentOrders
    .filter((o) => o.status === 'paid')
    .reduce((sum, o) => sum + o.totalKobo, 0);
  const netKobo = Math.round(grossKobo * 0.985);
  const pending = currentOrders.filter((o) => o.status === 'pending').length;

  return {
    capacity,
    ticketsSold: sold,
    ticketsRemaining: Math.max(0, capacity - sold),
    ticketsCheckedIn: checkedIn,
    grossKobo,
    netKobo,
    ordersPending: pending,
    isSoldOut: sold >= capacity,
    salesClosed: false,
    byChannel: {
      card: currentOrders.filter((o) => o.paystackChannel === 'card').length,
      bank_transfer: currentOrders.filter((o) => o.paystackChannel === 'bank_transfer').length,
      ussd: currentOrders.filter((o) => o.paystackChannel === 'ussd').length,
    },
    lastUpdatedAt: new Date().toISOString(),
  };
}

export async function initiatePurchase(input: {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerMatricNumber: string | null;
  quantity: number;
}): Promise<{ authorizationUrl: string; reference: string }> {
  await delay(200);
  const randRef = `ENG26-TX-${Math.floor(100000 + Math.random() * 900000)}`;
  const orderId = `ord_live_${Date.now()}`;
  const unitPriceKobo = eventConfig.ticketing.priceKobo;
  const totalKobo = unitPriceKobo * input.quantity;

  const newOrder: Order = {
    id: orderId,
    reference: randRef,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    buyerPhone: input.buyerPhone,
    buyerMatricNumber: input.buyerMatricNumber,
    quantity: input.quantity,
    unitPriceKobo,
    feeKobo: 0,
    totalKobo,
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
      holderMatricNumber: input.buyerMatricNumber,
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

export async function getTicketByCode(code: string): Promise<Ticket | null> {
  await delay(150);
  const clean = code.trim().toUpperCase();
  const ticket = currentTickets.find((t) => t.code.toUpperCase() === clean);
  return ticket ? { ...ticket } : null;
}

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

export async function renameTicketHolder(
  ticketId: string,
  holderName: string,
  holderMatricNumber: string | null
): Promise<void> {
  await delay(200);
  const ticket = currentTickets.find((t) => t.id === ticketId);
  if (!ticket) throw new Error('Ticket not found');
  ticket.holderName = holderName.trim();
  ticket.holderMatricNumber = holderMatricNumber?.trim() || null;
}

// ---- Door / scanner ----
export async function getCheckInManifest(): Promise<Ticket[]> {
  await delay(200);
  return [...currentTickets];
}

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
        o.buyerPhone.includes(q) ||
        (o.buyerMatricNumber && o.buyerMatricNumber.toLowerCase().includes(q))
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
        (t.holderMatricNumber && t.holderMatricNumber.toLowerCase().includes(q))
    );
  }

  return filtered;
}

export async function voidTicket(ticketId: string, reason: string): Promise<void> {
  await delay(150);
  const ticket = currentTickets.find((t) => t.id === ticketId);
  if (ticket) {
    ticket.status = 'void';
  }
}

export async function issueComplimentaryTicket(input: {
  holderName: string;
  holderMatricNumber: string | null;
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
    holderMatricNumber: input.holderMatricNumber,
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
    buyerEmail: 'vip@unilageng.ng',
    buyerPhone: '+2348000000000',
    buyerMatricNumber: input.holderMatricNumber,
    quantity: 1,
    unitPriceKobo: 0,
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

export async function exportOrdersCsv(): Promise<string> {
  await delay(150);
  const headers = ['Order Reference', 'Buyer Name', 'Email', 'Phone', 'Matric Number', 'Quantity', 'Total NGN', 'Status', 'Date'];
  const rows = currentOrders.map((o) => [
    o.reference,
    `"${o.buyerName}"`,
    o.buyerEmail,
    o.buyerPhone,
    o.buyerMatricNumber || 'N/A',
    o.quantity,
    o.totalKobo / 100,
    o.status,
    o.createdAt,
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export async function getCurrentStaffUser(): Promise<StaffUser | null> {
  await delay(100);
  return currentStaffUser ? { ...currentStaffUser } : null;
}
