import { NextResponse, after } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { paystackVerify } from '@/lib/api/paystack';
import { deliverTicketEmail } from '@/lib/email';
import { orderFromRow, ticketFromRow } from '@/lib/api/mappers';
import { rateLimit, clientIp } from '@/lib/api/rate-limit';

/**
 * The ticket page's data source. The reference is a bearer token — an
 * unguessable 69-bit code generated at checkout — so possession of the URL
 * is the authorisation, same model as an airline booking reference.
 *
 * Lazy verification: if the order is still pending (the buyer usually beats
 * the webhook home), ask Paystack directly and settle through the SAME
 * idempotent mark_order_paid the webhook uses. The client still decides
 * nothing — this is one server asking another.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const ip = clientIp(req);
  if (!rateLimit(`order:ip:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const { reference } = await params;
  const clean = reference.trim();
  if (!clean || clean.length > 64) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const supabase = getSupabaseAdminClient();

  const { data: orderRow, error } = await supabase
    .from('orders')
    .select('*')
    .eq('reference', clean)
    .maybeSingle();

  if (error) {
    console.error('order lookup failed:', error);
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  }
  if (!orderRow) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let order = orderRow;

  if (order.status === 'pending' || order.status === 'abandoned') {
    try {
      const verified = await paystackVerify(clean);
      if (verified?.status === 'success') {
        const { data: settled } = await supabase.rpc('mark_order_paid', {
          p_reference: clean,
          p_amount_kobo: verified.amountKobo,
          p_channel: verified.channel,
          p_raw: verified.raw,
        });
        // The buyer usually beats the webhook home, so this path is often the
        // one that actually flips the order. Same 'paid'-only guard: whichever
        // of the two lands second gets 'already_paid' and sends nothing.
        const settledRow = Array.isArray(settled) ? settled[0] : settled;
        if (settledRow?.outcome === 'paid') {
          after(async () => {
            const result = await deliverTicketEmail(clean);
            if (!result.ok) console.error(`order: ticket email for ${clean} — ${result.reason}`);
          });
        }
        const { data: fresh } = await supabase
          .from('orders')
          .select('*')
          .eq('reference', clean)
          .maybeSingle();
        if (fresh) order = fresh;
      }
    } catch (err) {
      // Verify being down is not fatal — the webhook will settle it.
      console.warn('lazy verify failed (webhook will settle):', err);
    }
  }

  const { data: ticketRows, error: ticketsError } = await supabase
    .from('tickets')
    .select('*')
    .eq('order_id', order.id)
    .order('issued_at', { ascending: true });

  if (ticketsError) {
    console.error('tickets lookup failed:', ticketsError);
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  }

  return NextResponse.json({
    order: orderFromRow(order),
    tickets: (ticketRows ?? []).map(ticketFromRow),
  });
}
