import type {
  Order,
  Ticket,
  CheckInResult,
  SalesSummary,
  PublicSalesCounter,
  StaffUser,
  EmailCampaign,
  EmailCampaignKind,
  EmailCampaignAudience,
  AttendeeType,
} from '@/types/ticketing';
import { eventConfig } from '@/config/event.config';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

// ============================================================
// CONTRACT — the ONLY boundary between UI and data.
// Components import from here and nowhere else.
//
// Two transports, chosen by trust level:
//  - Supabase RPCs, called directly with the browser client: the anon
//    public counter, and the staff functions (manifest, check-in, sales
//    gate) whose authorisation lives INSIDE the SECURITY DEFINER
//    functions, keyed off the caller's session.
//  - /api/* routes for everything that needs the service-role key:
//    checkout, order lookup by bearer reference, and the admin surface
//    (guarded server-side by requireStaff).
//
// Signatures must NOT change — components depend on them.
// ============================================================

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON error body — fall through to the status check
  }
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    const err = new Error(message) as Error & { code?: string };
    if (body && typeof body === 'object' && 'code' in body) {
      err.code = String((body as { code: unknown }).code);
    }
    throw err;
  }
  return body as T;
}

/**
 * The manifest RPC deliberately returns five columns and nothing else, but
 * the Ticket contract carries more. The scanner reads only what the manifest
 * ships (code, holder, phone, status); the rest is inert filler so the
 * signature — and the IndexedDB cache shape — stay stable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ticketFromManifestRow(row: any): Ticket {
  return {
    id: row.id,
    orderId: '',
    code: row.code,
    holderName: row.holder_name,
    holderPhone: row.holder_phone,
    status: row.status,
    issuedAt: '',
    checkedInAt: null,
    checkedInBy: null,
    checkedInDevice: null,
  };
}

// ---- Public ----

/** ADMIN ONLY: gross, net, service charge, gateway fees. Server-guarded. */
export async function getSalesSummary(): Promise<SalesSummary> {
  return apiJson<SalesSummary>('/api/admin/summary');
}

/** The ONE sales figure an unauthenticated visitor may read. Counts, never rows. */
export async function getPublicSalesCounter(): Promise<PublicSalesCounter> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_public_counter');
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    throw new Error('Could not load ticket availability.');
  }
  return {
    capacity: row.capacity,
    ticketsSold: row.tickets_sold,
    ticketsRemaining: row.tickets_remaining,
    ticketsCheckedIn: row.tickets_checked_in,
    isSoldOut: row.is_sold_out,
    salesClosed: row.sales_closed,
    currentPriceKobo:
      typeof row.current_price_kobo === 'number' && Number.isFinite(row.current_price_kobo)
        ? row.current_price_kobo
        : eventConfig.ticketing.priceKobo,
    lastUpdatedAt: row.last_updated_at,
  };
}



/** Admin role only — enforced inside set_sales_open, which also audits the flip. */
export async function setSalesOpen(open: boolean): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('set_sales_open', { p_open: open });
  if (error) {
    throw new Error('Could not change sales status. Are you signed in as an admin?');
  }
}

/**
 * Starts a real Paystack transaction. The server computes the amount from
 * config — nothing money-shaped leaves this client. The returned
 * authorizationUrl is Paystack's hosted checkout; navigate to it.
 */
// Signature changed on purpose for the Summit: attendeeType was added. Required
// server-side — the checkout route rejects a paying order without it.
export async function initiatePurchase(input: {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  attendeeType: AttendeeType;
  quantity: number;
  marketingOptIn?: boolean;
}): Promise<{ authorizationUrl: string; reference: string }> {
  return apiJson<{ authorizationUrl: string; reference: string }>('/api/checkout', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function setTicketPrice(priceKobo: number): Promise<void> {
  await apiJson('/api/admin/price', {
    method: 'POST',
    body: JSON.stringify({ priceKobo }),
  });
}

export async function previewCampaignRecipients(input: {
  kind: EmailCampaignKind;
  audience: EmailCampaignAudience;
}): Promise<number> {
  const result = await apiJson<{ count: number }>('/api/admin/campaigns/preview', {
    method: 'POST', body: JSON.stringify(input),
  });
  return result.count;
}

export async function sendCampaignTest(input: {
  kind: EmailCampaignKind; subject: string; message: string; email: string;
}): Promise<void> {
  await apiJson('/api/admin/campaigns/test', { method: 'POST', body: JSON.stringify(input) });
}

/**
 * `testEmail` sends the real campaign to that one address instead of the
 * resolved audience — same rows, same batch worker, one recipient. Additive:
 * existing callers that omit it are unaffected.
 */
export async function createEmailCampaign(input: {
  kind: EmailCampaignKind; audience: EmailCampaignAudience; subject: string; message: string;
  testEmail?: string;
}): Promise<EmailCampaign> {
  const result = await apiJson<{ campaign: EmailCampaign }>('/api/admin/campaigns', {
    method: 'POST', body: JSON.stringify(input),
  });
  return result.campaign;
}

export async function listEmailCampaigns(): Promise<EmailCampaign[]> {
  const result = await apiJson<{ campaigns: EmailCampaign[] }>('/api/admin/campaigns');
  return result.campaigns;
}

export async function processEmailCampaign(id: string, retryFailed = false): Promise<EmailCampaign> {
  const result = await apiJson<{ campaign: EmailCampaign }>(`/api/admin/campaigns/${id}/process`, {
    method: 'POST', body: JSON.stringify({ retryFailed }),
  });
  return result.campaign;
}

/**
 * Read-only status check. The order route lazily verifies against Paystack
 * server-side; this client never decides payment status.
 */
export async function confirmPurchase(
  reference: string
): Promise<{ order: Order; tickets: Ticket[] }> {
  const result = await getOrderByReference(reference);
  if (!result) throw new Error('Order reference not found');
  return result;
}

/** Staff-only lookup, served from the manifest RPC (five columns, no more). */
export async function getTicketByCode(code: string): Promise<Ticket | null> {
  const clean = code.trim().toUpperCase();
  const manifest = await getCheckInManifest();
  return manifest.find((t) => t.code.toUpperCase() === clean) ?? null;
}

/** Bearer lookup: possession of the unguessable reference IS the authorisation. */
export async function getOrderByReference(reference: string): Promise<{
  order: Order;
  tickets: Ticket[];
} | null> {
  const clean = reference.trim();
  if (!clean) return null;
  const res = await fetch(`/api/orders/${encodeURIComponent(clean)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Could not load your order. Please retry.');
  return (await res.json()) as { order: Order; tickets: Ticket[] };
}

// holderPhone is deliberately not a parameter: it is the door's identity
// check, so the holder must not be able to rewrite it.
export async function renameTicketHolder(
  ticketId: string,
  holderName: string
): Promise<void> {
  await apiJson('/api/tickets/rename', {
    method: 'POST',
    body: JSON.stringify({ ticketId, holderName: holderName.trim() }),
  });
}

// ---- Door / scanner ----

/**
 * The MINIMAL manifest — code, holder_name, holder_phone, status. Requires a
 * signed-in staff session; the RPC returns zero rows to anyone else.
 */
export async function getCheckInManifest(): Promise<Ticket[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_check_in_manifest');
  if (error) {
    throw new Error('Could not download the ticket manifest. Are you signed in?');
  }
  return (data ?? []).map(ticketFromManifestRow);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkInResultFromRow(row: any, scannedCode: string): CheckInResult {
  const ticket: Ticket = {
    id: row.ticket_id ?? '',
    orderId: '',
    code: row.code ?? scannedCode,
    holderName: row.holder_name ?? '',
    holderPhone: row.holder_phone ?? null,
    status:
      row.result === 'admitted' || row.result === 'already_used'
        ? 'checked_in'
        : row.result === 'voided'
          ? 'void'
          : 'valid',
    issuedAt: '',
    checkedInAt: row.first_scanned_at ?? null,
    checkedInBy: null,
    checkedInDevice: null,
  };

  switch (row.result) {
    case 'admitted':
      return { kind: 'admitted', ticket, admittedCount: row.admitted_count ?? 0 };
    case 'already_used':
      return {
        kind: 'already_used',
        ticket,
        firstScannedAt: row.first_scanned_at ?? '',
        firstScannedBy: row.first_scanned_by ?? 'door staff',
      };
    case 'voided':
      return { kind: 'voided', ticket };
    case 'unpaid':
      return { kind: 'unpaid', ticket };
    case 'not_found':
    default:
      return { kind: 'not_found', scannedCode };
  }
}

/**
 * First scan wins — decided by record_check_in's single conditional UPDATE,
 * not here. staffId comes from the session server-side (auth.uid()); the
 * parameter is accepted for signature stability but the server's answer is
 * the one that counts.
 */
export async function checkInTicket(input: {
  code: string;
  staffId: string;
  deviceId: string;
  scannedAt: string;
}): Promise<CheckInResult> {
  const clean = input.code.trim().toUpperCase();
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('record_check_in', {
    p_code: clean,
    p_device: input.deviceId,
    p_scanned_at: input.scannedAt,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    throw new Error('Check-in failed — no connection to the server.');
  }
  return checkInResultFromRow(row, clean);
}

/**
 * Flushes the offline queue. record_check_in is idempotent — a duplicate
 * flush returns already_used instead of admitting twice — and earliest
 * scanned_at wins because the queue replays in order.
 */
export async function syncQueuedCheckIns(
  queued: Array<{ code: string; staffId: string; deviceId: string; scannedAt: string }>
): Promise<CheckInResult[]> {
  const results: CheckInResult[] = [];
  for (const item of queued) {
    results.push(await checkInTicket(item));
  }
  return results;
}

// ---- Admin ----

/** Admin role only, guarded server-side. Paginated. */
export async function listOrders(opts?: {
  status?: Order['status'];
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<{ orders: Order[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.query?.trim()) params.set('query', opts.query.trim());
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  const qs = params.toString();
  return apiJson<{ orders: Order[]; total: number }>(`/api/admin/orders${qs ? `?${qs}` : ''}`);
}

/** Admin role only. */
export async function listTickets(opts?: {
  status?: Ticket['status'];
  query?: string;
}): Promise<Ticket[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.query?.trim()) params.set('query', opts.query.trim());
  const qs = params.toString();
  const { tickets } = await apiJson<{ tickets: Ticket[] }>(
    `/api/admin/tickets${qs ? `?${qs}` : ''}`
  );
  return tickets;
}

/** Admin only. A status flip plus an audit row — never a delete. */
export async function voidTicket(ticketId: string, reason: string): Promise<void> {
  await apiJson('/api/admin/void', {
    method: 'POST',
    body: JSON.stringify({ ticketId, reason }),
  });
}

/** Admin only. Zero-value order through the standard money path — counts
 *  against capacity like any other ticket. */
export async function issueComplimentaryTicket(input: {
  holderName: string;
  holderPhone: string | null;
}): Promise<Ticket> {
  const { ticket } = await apiJson<{ ticket: Ticket }>('/api/admin/comp', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return ticket;
}

/** Admin only. Rejects with the server's reason if the send did not land —
 *  a resend button that cannot fail is a resend button that does nothing. */
export async function resendTicketEmail(reference: string): Promise<void> {
  await apiJson('/api/admin/resend', {
    method: 'POST',
    body: JSON.stringify({ reference }),
  });
}

/** Admin only. Every export is written to the audit log server-side. */
export async function exportOrdersCsv(): Promise<string> {
  const res = await fetch('/api/admin/export', { cache: 'no-store' });
  if (!res.ok) throw new Error('Export failed. Are you signed in as an admin?');
  return res.text();
}

/** Reads the live Supabase session; null when nobody (or a non-staff user)
 *  is signed in. */
export async function getCurrentStaffUser(): Promise<StaffUser | null> {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const { data, error } = await supabase.rpc('get_current_staff');
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return null;
  return { id: row.id, name: row.name, role: row.role };
}
