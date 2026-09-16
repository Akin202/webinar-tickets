import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ATTENDEE_TYPES, computeOrderTotals, normaliseNgPhone } from '@/types/ticketing';
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
  attendeeType: z.enum(ATTENDEE_TYPES),
  quantity: z.number().int().min(1).max(eventConfig.ticketing.maxPerOrder),
  marketingOptIn: z.boolean().optional().default(false),
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

  const reference = generateReference();
  const supabase = getSupabaseAdminClient();
  let totals: ReturnType<typeof computeOrderTotals> | null = null;
  let outcome: string | null = null;
  let createError: unknown = null;

  // Fetch, calculate, then let the locked RPC compare the price. If an admin
  // changes it in that tiny gap, retry once with the new authoritative value.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: settings, error: settingsError } = await supabase
      .from('event_settings').select('current_price_kobo').maybeSingle();
    if (settingsError || !settings) {
      return NextResponse.json({ error: 'Could not load the current ticket price.' }, { status: 503 });
    }
    totals = computeOrderTotals({
      quantity: parsed.quantity,
      unitPriceKobo: settings.current_price_kobo,
      serviceChargeRate: eventConfig.ticketing.serviceChargeRate,
      passFeeToBuyer: eventConfig.ticketing.passFeeToBuyer,
    });
    const created = await supabase.rpc('create_pending_order', {
      p_reference: reference,
      p_buyer_name: parsed.buyerName,
      p_buyer_email: parsed.buyerEmail,
      p_buyer_phone: buyerPhone,
      p_quantity: parsed.quantity,
      p_unit_price_kobo: totals.unitPriceKobo,
      p_service_charge_kobo: totals.serviceChargeKobo,
      p_fee_kobo: totals.gatewayFeeKobo,
      p_total_kobo: totals.totalKobo,
      p_marketing_opt_in: parsed.marketingOptIn,
      p_attendee_type: parsed.attendeeType,
    });
    createError = created.error;
    const createdRow = (Array.isArray(created.data) ? created.data[0] : created.data) as { outcome?: string } | null;
    outcome = createdRow?.outcome ?? null;
    if (outcome !== 'price_changed') break;
  }
  if (createError || !outcome || !totals || outcome === 'price_changed') {
    console.error('create_pending_order failed:', createError);
    return NextResponse.json({ error: 'The ticket price just changed. Please retry.' }, { status: 409 });
  }
  if (outcome === 'sales_closed') {
    return NextResponse.json({ error: 'Ticket sales are currently closed.', code: 'sales_closed' }, { status: 409 });
  }
  if (outcome === 'sold_out') {
    return NextResponse.json({ error: 'Not enough tickets remaining.', code: 'sold_out' }, { status: 409 });
  }
  // The database's own cap on how many seats one phone may hold unpaid at
  // once. This is the guarantee — the rate limits above are per-instance
  // memory and fail open on a cold start, so they trim abuse rather than
  // stopping it. Only this one actually protects the seat count.
  if (outcome === 'phone_limit') {
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
        attendee_type: parsed.attendeeType,
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
