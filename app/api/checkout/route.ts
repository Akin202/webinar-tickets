import { NextResponse } from 'next/server';
import { z } from 'zod';
import { computeOrderTotals, normaliseNgPhone } from '@/types/ticketing';
import { eventConfig } from '@/config/event.config';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { paystackInitialize } from '@/lib/api/paystack';
import { rateLimit, clientIp } from '@/lib/api/rate-limit';
import { generateReference } from '@/lib/api/reference';
import { readCappedJson, cappedBodyError } from '@/lib/api/body-limit';
import { readDeviceId, isDeviceIdConfigured } from '@/lib/api/device-id';

const checkoutSchema = z.object({
  buyerName: z.string().trim().min(2).max(120),
  buyerEmail: z.string().trim().email().max(254),
  buyerPhone: z.string().trim().min(7).max(20),
  quantity: z.number().int().min(1).max(eventConfig.ticketing.maxPerOrder),
});

export async function POST(req: Request) {
  const ip = clientIp(req);

  // Layered, most precise first. The device cookie is stamped on the page view
  // (middleware.ts), so a real buyer arrives holding one and gets their own
  // budget; a script posting straight at this endpoint holds none and shares
  // the stricter per-IP no-cookie bucket with every other such caller.
  if (isDeviceIdConfigured()) {
    const deviceId = await readDeviceId(req);
    const key = deviceId ? `checkout:device:${deviceId}` : `checkout:nocookie:${ip}`;
    if (!rateLimit(key, 3, 10 * 60_000)) {
      return NextResponse.json(
        { error: 'Too many checkout attempts. Please wait a few minutes.' },
        { status: 429 }
      );
    }
  }

  // Raised from 10 deliberately, and it is not a weakening: Nigerian mobile
  // data is behind carrier-grade NAT, so thousands of real buyers share a
  // handful of addresses and 10/min throttled the crowd rather than the abuser.
  // The device buckets above now carry the precision this one was failing to
  // provide; this is left as a coarse ceiling on any single address.
  if (!rateLimit(`checkout:ip:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 });
  }

  const body = await readCappedJson(req);
  if (!body.ok) return cappedBodyError(body, 'Invalid checkout details.');

  let parsed;
  try {
    parsed = checkoutSchema.parse(body.value);
  } catch {
    return NextResponse.json({ error: 'Invalid checkout details.' }, { status: 400 });
  }

  const buyerPhone = normaliseNgPhone(parsed.buyerPhone);
  if (!/^\+234[0-9]{10}$/.test(buyerPhone)) {
    return NextResponse.json({ error: 'Enter a valid Nigerian phone number.' }, { status: 400 });
  }
  if (!rateLimit(`checkout:phone:${buyerPhone}`, 3, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many orders for this phone number. Please wait.' }, { status: 429 });
  }

  // THE money computation. Server-side, from config — a client-sent amount
  // is never read, so there is nothing for a tampered client to tamper with.
  const totals = computeOrderTotals({
    quantity: parsed.quantity,
    unitPriceKobo: eventConfig.ticketing.priceKobo,
    serviceChargeRate: eventConfig.ticketing.serviceChargeRate,
    passFeeToBuyer: eventConfig.ticketing.passFeeToBuyer,
  });

  const reference = generateReference();
  const supabase = getSupabaseAdminClient();

  // Atomic capacity + sales-gate check and insert (FOR UPDATE inside).
  const { data, error } = await supabase.rpc('create_pending_order', {
    p_reference: reference,
    p_buyer_name: parsed.buyerName,
    p_buyer_email: parsed.buyerEmail,
    p_buyer_phone: buyerPhone,
    p_quantity: parsed.quantity,
    p_unit_price_kobo: totals.unitPriceKobo,
    p_service_charge_kobo: totals.serviceChargeKobo,
    p_fee_kobo: totals.gatewayFeeKobo,
    p_total_kobo: totals.totalKobo,
  });
  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row) {
    console.error('create_pending_order failed:', error);
    return NextResponse.json({ error: 'Could not start your order. Please retry.' }, { status: 500 });
  }
  if (row.outcome === 'sales_closed') {
    return NextResponse.json({ error: 'Ticket sales are currently closed.', code: 'sales_closed' }, { status: 409 });
  }
  if (row.outcome === 'sold_out') {
    return NextResponse.json({ error: 'Not enough tickets remaining.', code: 'sold_out' }, { status: 409 });
  }
  // The database's own cap on how many seats one phone may hold unpaid at
  // once. This is the guarantee — the rate limits above are per-instance
  // memory and fail open on a cold start, so they trim abuse rather than
  // stopping it. Only this one actually protects the seat count.
  if (row.outcome === 'phone_limit') {
    return NextResponse.json(
      {
        error: 'You already have tickets reserved. Complete that payment first, or wait a few minutes and try again.',
        code: 'phone_limit',
      },
      { status: 429 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || eventConfig.seo.siteUrl;

  try {
    const init = await paystackInitialize({
      email: parsed.buyerEmail,
      amountKobo: totals.totalKobo,
      reference,
      callbackUrl: `${siteUrl}/ticket/${reference}`,
      metadata: {
        buyer_name: parsed.buyerName,
        buyer_phone: buyerPhone,
        quantity: parsed.quantity,
        event: eventConfig.event.name,
      },
    });
    return NextResponse.json({ authorizationUrl: init.authorizationUrl, reference });
  } catch (err) {
    console.error('paystack initialize failed:', err);

    // Release the seat now rather than letting the 30-minute sweep do it.
    // Paystack never issued a checkout for this reference, so the order is
    // already dead — holding its seats punishes the next buyer for our
    // dependency being down, which during a rush is exactly when it hurts.
    //
    // Safe against the case where Paystack actually did create the
    // transaction and only the response failed: mark_order_paid accepts
    // 'abandoned' as a flippable prior status and re-checks capacity for it,
    // so a late genuine payment still settles, and settles correctly.
    const { error: releaseError } = await supabase
      .from('orders')
      .update({ status: 'abandoned' })
      .eq('reference', reference)
      .eq('status', 'pending');

    if (releaseError) {
      // Not fatal — the sweep is still the backstop.
      console.error(`checkout: could not release seats for ${reference}`, releaseError);
    }

    return NextResponse.json(
      { error: 'Payment provider unavailable. Please retry shortly.' },
      { status: 502 }
    );
  }
}
