import { NextResponse, after } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { deliverTicketEmail } from '@/lib/email';
import { logSettleOutcome } from '@/lib/api/settle-log';

/**
 * THE authority on payment status. Nothing else marks an order paid — the
 * order-status route's lazy verify goes through the same idempotent
 * mark_order_paid function, so whichever path lands second is a no-op.
 *
 * Paystack signs the RAW request body with the account's secret key
 * (HMAC-SHA512, x-paystack-signature). There is no separate webhook secret.
 * Verify BEFORE parsing: an unsigned body is untrusted input.
 *
 * Always answer 200 once the signature checks out — Paystack retries
 * non-2xx responses, and a permanent processing error would retry forever.
 * Failures are logged server-side instead.
 */
export async function POST(req: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error('webhook: PAYSTACK_SECRET_KEY not configured');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature') ?? '';
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  if (event?.event !== 'charge.success') {
    // Not ours to act on; acknowledge so Paystack stops retrying.
    return NextResponse.json({ received: true });
  }

  const reference: string | undefined = event?.data?.reference;
  const amountKobo: number | undefined = event?.data?.amount;
  const channel: string | null = event?.data?.channel ?? null;

  if (!reference || typeof amountKobo !== 'number') {
    console.error('webhook: charge.success missing reference/amount', event?.data);
    return NextResponse.json({ received: true });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('mark_order_paid', {
    p_reference: reference,
    p_amount_kobo: amountKobo,
    p_channel: channel,
    p_raw: event,
  });
  const row = Array.isArray(data) ? data[0] : data;

  if (error) {
    // 500 so Paystack retries — transient DB failure must not lose a payment.
    console.error('webhook: mark_order_paid errored', error);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }

  // Only on the transition. mark_order_paid returns 'already_paid' on a
  // replay, so Paystack's retries cannot turn into a stream of duplicate
  // emails to the same buyer.
  if (row?.outcome === 'paid') {
    // after() rather than a bare floating promise: this runs once the
    // response is sent, but the runtime keeps the function alive for it.
    // An un-awaited fetch would simply be killed when the handler returns.
    // Nothing here may affect the 200 — Paystack retries non-2xx, and a
    // bounced email is not a reason to reprocess a payment.
    after(async () => {
      const result = await deliverTicketEmail(reference);
      if (!result.ok) console.error(`webhook: ticket email for ${reference} — ${result.reason}`);
    });
  }

  logSettleOutcome('webhook', reference, amountKobo, row?.outcome);

  return NextResponse.json({ received: true, outcome: row?.outcome ?? 'unknown' });
}
