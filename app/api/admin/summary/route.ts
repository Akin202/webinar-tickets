import { NextResponse } from 'next/server';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { SalesSummary } from '@/types/ticketing';

/**
 * ADMIN ONLY. The one endpoint that carries money. Never reachable from an
 * anon surface — the public page uses the counts-only get_public_counter RPC.
 */
export async function GET(req: Request) {
  const auth = await requireStaffRequest(req, 'admin');
  if ('error' in auth) return auth.error;

  const supabase = getSupabaseAdminClient();

  const [settingsRes, ordersRes, ticketsRes, livestreamRes] = await Promise.all([
    supabase.from('event_settings').select('*').maybeSingle(),
    supabase
      .from('orders')
      .select('status, total_kobo, fee_kobo, service_charge_kobo, paystack_channel'),
    supabase.from('tickets').select('status'),
    // Counted, never summed into anything: these rows are free and must not
    // touch capacity, gross or the seat maths above.
    supabase.from('livestream_registrations').select('id', { count: 'exact', head: true }),
  ]);

  if (settingsRes.error || ordersRes.error || ticketsRes.error || !settingsRes.data) {
    console.error('summary failed:', settingsRes.error, ordersRes.error, ticketsRes.error);
    return NextResponse.json({ error: 'summary failed' }, { status: 500 });
  }
  if (livestreamRes.error) {
    // Not fatal: the money numbers are what this endpoint exists for, and a
    // missing livestream count must not blank the whole admin dashboard.
    console.error('summary: livestream count failed', livestreamRes.error);
  }

  const settings = settingsRes.data;
  const orders = ordersRes.data ?? [];
  const tickets = ticketsRes.data ?? [];

  const paid = orders.filter((o) => o.status === 'paid');
  const sold = tickets.filter((t) => t.status !== 'void').length;
  const checkedIn = tickets.filter((t) => t.status === 'checked_in').length;
  const grossKobo = paid.reduce((s, o) => s + o.total_kobo, 0);
  const gatewayFeesKobo = paid.reduce((s, o) => s + o.fee_kobo, 0);
  const serviceChargeKobo = paid.reduce((s, o) => s + o.service_charge_kobo, 0);

  const byChannel: Record<string, number> = {};
  for (const o of paid) {
    const ch = o.paystack_channel ?? 'unknown';
    byChannel[ch] = (byChannel[ch] ?? 0) + 1;
  }

  const summary: SalesSummary = {
    capacity: settings.capacity,
    ticketsSold: sold,
    ticketsRemaining: Math.max(0, settings.capacity - sold),
    ticketsCheckedIn: checkedIn,
    grossKobo,
    gatewayFeesKobo,
    serviceChargeKobo,
    netKobo: grossKobo - gatewayFeesKobo - serviceChargeKobo,
    ordersPending: orders.filter((o) => o.status === 'pending').length,
    isSoldOut: sold >= settings.capacity,
    salesClosed:
      !settings.sales_open ||
      (settings.sales_hard_stop !== null && Date.now() > new Date(settings.sales_hard_stop).getTime()),
    currentPriceKobo: settings.current_price_kobo,
    livestreamRegistrations: livestreamRes.count ?? 0,
    byChannel,
    lastUpdatedAt: new Date().toISOString(),
  };

  return NextResponse.json(summary);
}
