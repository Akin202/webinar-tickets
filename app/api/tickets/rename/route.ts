import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eventConfig, doorsOpenIso } from '@/config/event.config';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIp } from '@/lib/api/rate-limit';
import { assertSameOrigin } from '@/lib/api/origin';

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
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  if (!eventConfig.featureFlags.allowNameChange) {
    return NextResponse.json({ error: 'Name changes are closed.' }, { status: 403 });
  }

  // Hard cutoff at doors-open. Once staff are scanning, the manifest is already
  // on their phones and may be offline for the rest of the night — a rename
  // landing after that changes the server while the door still shows the old
  // name, so the identity challenge stops matching the pass. Renaming is a
  // pre-event convenience, not a live operation.
  if (Date.now() > new Date(doorsOpenIso).getTime()) {
    return NextResponse.json(
      { error: 'Name changes closed — doors are open. Speak to an organiser at the gate.' },
      { status: 403 }
    );
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

  // The parent order must still be paid. Tickets are only minted on payment,
  // but an order can move to 'refunded' afterwards while its ticket rows
  // survive — that pass is no longer a live entitlement and must not be
  // renamed onto a new person. Read before write; the conditional UPDATE below
  // still carries the precondition that actually races (status = 'valid').
  const { data: existing, error: readError } = await supabase
    .from('tickets')
    .select('id, code, holder_name, status, orders!inner(status)')
    .eq('id', parsed.ticketId)
    .maybeSingle();

  if (readError) {
    console.error('rename lookup failed:', readError);
    return NextResponse.json({ error: 'Rename failed.' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Ticket not found or no longer editable.' }, { status: 404 });
  }

  const order = Array.isArray(existing.orders) ? existing.orders[0] : existing.orders;
  if (order?.status !== 'paid') {
    return NextResponse.json({ error: 'Ticket not found or no longer editable.' }, { status: 404 });
  }

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

  // Who a pass belongs to is the door's identity check. A change to it is a
  // security-relevant event and gets the same audit trail as a void or an
  // export. actor_id is null: this endpoint is authenticated by possession of
  // the order reference, not by a staff session.
  await supabase.from('settings_audit').insert({
    actor_id: null,
    field: 'ticket_holder_rename',
    old_value: `${existing.code}: ${existing.holder_name}`,
    new_value: parsed.holderName,
  });

  return NextResponse.json({ ok: true });
}
