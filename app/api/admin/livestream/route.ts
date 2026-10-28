import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { normaliseNgPhone } from '@/types/ticketing';
import { readCappedJson, cappedBodyError } from '@/lib/api/body-limit';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(20).optional(),
});

export async function POST(req: Request) {
  const auth = await requireStaffRequest(req, 'admin', { mutating: true });
  if ('error' in auth) return auth.error;

  const body = await readCappedJson(req);
  if (!body.ok) return cappedBodyError(body, 'Invalid request.');

  const parsed = schema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Provide a valid name and email address.' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const phone = parsed.data.phone ? normaliseNgPhone(parsed.data.phone) : '+2348012345678';
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('livestream_registrations')
    .upsert(
      {
        name: parsed.data.name,
        email,
        phone,
        attendee_type: 'student',
        marketing_opt_in: true,
      },
      { onConflict: 'email' }
    )
    .select()
    .single();

  if (error) {
    console.error('admin insert livestream registration failed:', error);
    return NextResponse.json({ error: 'Could not register email.' }, { status: 500 });
  }

  await supabase.from('marketing_preferences').upsert(
    { email, consented_at: new Date().toISOString() },
    { onConflict: 'email' }
  );

  return NextResponse.json({ ok: true, registration: data });
}

