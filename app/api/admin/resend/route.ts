import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/api/rate-limit';
import { deliverTicketEmail } from '@/lib/email';
import { readCappedJson, cappedBodyError } from '@/lib/api/body-limit';

const resendSchema = z.object({
  reference: z.string().trim().min(4).max(64),
});

/**
 * ADMIN ONLY. Re-sends a buyer's ticket email — a support action taken on
 * someone else's inbox, so it is rate-limited and audited like a void or an
 * export. Awaited rather than fired-and-forgotten: the whole point of the
 * button is that the organiser learns whether it worked.
 */
export async function POST(req: Request) {
  const auth = await requireStaffRequest(req, 'admin', { mutating: true });
  if ('error' in auth) return auth.error;

  // Tighter than the shared admin limit. Repeatedly mailing a buyer is a way
  // to get the sending domain reported, and a leaked session should not be
  // able to do it in a loop.
  if (!rateLimit(`admin:resend:${auth.staff.id}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many resends. Wait a minute.' }, { status: 429 });
  }

  const body = await readCappedJson(req);
  if (!body.ok) return cappedBodyError(body, 'Invalid request.');

  let parsed;
  try {
    parsed = resendSchema.parse(body.value);
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const result = await deliverTicketEmail(parsed.reference);

  const supabase = getSupabaseAdminClient();
  // Audited whether or not it landed: "I definitely resent it" is exactly the
  // claim this row has to be able to settle after the event.
  await supabase.from('settings_audit').insert({
    actor_id: auth.staff.id,
    field: 'ticket_email_resend',
    old_value: parsed.reference,
    new_value: result.ok ? 'sent' : `failed: ${result.reason}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
