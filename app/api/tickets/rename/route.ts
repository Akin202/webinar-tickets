import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eventConfig } from '@/config/event.config';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIp } from '@/lib/api/rate-limit';

const renameSchema = z.object({
  ticketId: z.string().uuid(),
  holderName: z.string().trim().min(2).max(120),
});

/**
 * Holder rename. The ticket id (a random uuid, reachable only through the
 * order-reference bearer URL) is the proof of possession. holder_phone is
 * deliberately untouchable here — it is the door's identity check, and a
 * renameable identity check is not an identity check.
 */
export async function POST(req: Request) {
  if (!eventConfig.featureFlags.allowNameChange) {
    return NextResponse.json({ error: 'Name changes are closed.' }, { status: 403 });
  }

  const ip = clientIp(req);
  if (!rateLimit(`rename:ip:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many attempts.' }, { status: 429 });
  }

  let parsed;
  try {
    parsed = renameSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  // Only a not-yet-used ticket may be renamed; an admitted or voided one is
  // history and history does not get rewritten.
  const { data, error } = await supabase
    .from('tickets')
    .update({ holder_name: parsed.holderName })
    .eq('id', parsed.ticketId)
    .eq('status', 'valid')
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('rename failed:', error);
    return NextResponse.json({ error: 'Rename failed.' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Ticket not found or no longer editable.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
