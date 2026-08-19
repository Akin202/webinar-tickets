import { NextResponse } from 'next/server';
import { z } from 'zod';
import { computeOrderTotals, normaliseNgPhone } from '@/types/ticketing';
import { eventConfig } from '@/config/event.config';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { paystackInitialize } from '@/lib/api/paystack';
import { rateLimit, clientIp } from '@/lib/api/rate-limit';
import { generateReference } from '@/lib/api/reference';

const checkoutSchema = z.object({
  buyerName: z.string().trim().min(2).max(120),
  buyerEmail: z.string().trim().email().max(254),
  buyerPhone: z.string().trim().min(7).max(20),
  quantity: z.number().int().min(1).max(eventConfig.ticketing.maxPerOrder),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`checkout:ip:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 });
  }

  let parsed;
  try {
    parsed = checkoutSchema.parse(await req.json());
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
    // Order stays pending and is swept to abandoned after 30 minutes.
    console.error('paystack initialize failed:', err);
    return NextResponse.json(
      { error: 'Payment provider unavailable. Please retry shortly.' },
      { status: 502 }
    );
  }
}
