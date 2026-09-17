import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ATTENDEE_TYPES, normaliseNgPhone } from '@/types/ticketing';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIp } from '@/lib/api/rate-limit';
import { readCappedJson, cappedBodyError } from '@/lib/api/body-limit';
import { readDeviceId, isDeviceIdConfigured } from '@/lib/api/device-id';
import { sendLivestreamEmail } from '@/lib/email';

/**
 * Free livestream registration.
 *
 * Takes no money and touches no seat: register_livestream writes only to
 * public.livestream_registrations, which nothing in the capacity path reads.
 * The same guards as checkout apply anyway — an unauthenticated endpoint that
 * writes a row and sends an email is worth abusing even when it is free.
 */

const livestreamSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(20),
  attendeeType: z.enum(ATTENDEE_TYPES),
  marketingOptIn: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const ip = clientIp(req);

  // Same layering as checkout: the device cookie is stamped on the page view,
  // so a real visitor gets their own budget and a script that posts straight
  // here shares the stricter no-cookie bucket.
  if (isDeviceIdConfigured()) {
    const deviceId = await readDeviceId(req);
    const key = deviceId ? `livestream:device:${deviceId}` : `livestream:nocookie:${ip}`;
    if (!rateLimit(key, 5, 10 * 60_000)) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please wait a few minutes.' },
        { status: 429 }
      );
    }
  }

  // Coarse ceiling per address. Deliberately generous: Nigerian mobile data is
  // behind carrier-grade NAT, so a whole lecture hall can share one address.
  if (!rateLimit(`livestream:ip:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 });
  }

  const body = await readCappedJson(req);
  if (!body.ok) return cappedBodyError(body, 'Invalid registration details.');

  let parsed;
  try {
    parsed = livestreamSchema.parse(body.value);
  } catch {
    return NextResponse.json({ error: 'Invalid registration details.' }, { status: 400 });
  }

  const phone = normaliseNgPhone(parsed.phone);
  if (!/^\+234[0-9]{10}$/.test(phone)) {
    return NextResponse.json({ error: 'Enter a valid Nigerian phone number.' }, { status: 400 });
  }

  const email = parsed.email.toLowerCase();
  if (!rateLimit(`livestream:email:${email}`, 3, 10 * 60_000)) {
    return NextResponse.json(
      { error: 'This email was just registered. Check your inbox.' },
      { status: 429 }
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('register_livestream', {
    p_name: parsed.name,
    p_email: email,
    p_phone: phone,
    p_attendee_type: parsed.attendeeType,
    p_marketing_opt_in: parsed.marketingOptIn,
  });

  if (error) {
    console.error('register_livestream failed:', error);
    return NextResponse.json(
      { error: 'Could not complete your registration. Please try again.' },
      { status: 503 }
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string } | null;
  const outcome = row?.outcome === 'already_registered' ? 'already_registered' : 'registered';

  // The row is safely stored. A failed confirmation email must not turn that
  // into an error the visitor sees, or they register again and again — it is
  // logged loudly instead, the same posture the ticket email takes.
  await sendLivestreamEmail({
    name: parsed.name,
    email,
    alreadyRegistered: outcome === 'already_registered',
  });

  return NextResponse.json({ outcome });
}
