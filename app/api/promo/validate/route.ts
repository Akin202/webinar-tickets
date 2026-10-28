import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { eventConfig } from '@/config/event.config';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!code) {
      return NextResponse.json({ valid: false, error: 'Enter a promo code.' }, { status: 400 });
    }

    if (code !== eventConfig.promo.code) {
      return NextResponse.json({ valid: false, error: 'Invalid promo code.' }, { status: 400 });
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { valid: false, error: 'Enter your email above to validate this livestream code.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // 1. Verify that email exists in livestream_registrations
    const { data: registration, error: regError } = await supabase
      .from('livestream_registrations')
      .select('id, name')
      .eq('email', email)
      .maybeSingle();

    if (regError) {
      console.error('Promo validate: db error', regError);
      return NextResponse.json({ valid: false, error: 'Unable to validate code. Please retry.' }, { status: 500 });
    }

    if (!registration) {
      return NextResponse.json(
        {
          valid: false,
          error:
            'This discount code is exclusive to registered livestream attendees. Please checkout using the email address you registered for the livestream with.',
        },
        { status: 403 }
      );
    }

    // 2. Check if this email has already used the discount for a paid order
    const { data: existingPaidOrder, error: orderError } = await supabase
      .from('orders')
      .select('id')
      .eq('buyer_email', email)
      .eq('status', 'paid')
      .eq('unit_price_kobo', eventConfig.promo.discountPriceKobo)
      .maybeSingle();

    if (orderError) {
      console.error('Promo validate: order query error', orderError);
      return NextResponse.json({ valid: false, error: 'Unable to validate code. Please retry.' }, { status: 500 });
    }

    if (existingPaidOrder) {
      return NextResponse.json(
        {
          valid: false,
          error: 'This email has already claimed a discounted summit seat (limit 1 per livestream attendee).',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      valid: true,
      code: eventConfig.promo.code,
      discountUnitPriceKobo: eventConfig.promo.discountPriceKobo,
      maxQuantity: eventConfig.promo.maxQuantity,
      message: 'Livestream special discount applied: ₦3,000 Summit seat!',
    });
  } catch (error) {
    console.error('Promo validate error:', error);
    return NextResponse.json({ valid: false, error: 'Invalid request.' }, { status: 400 });
  }
}

