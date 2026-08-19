import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { readCappedJson, cappedBodyError } from '@/lib/api/body-limit';

const voidSchema = z.object({
  ticketId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

/** ADMIN ONLY. Void is a status flip plus an audit row — never a delete. */
export async function POST(req: Request) {
  const auth = await requireStaffRequest(req, 'admin', { mutating: true });
  if ('error' in auth) return auth.error;

  const body = await readCappedJson(req);
  if (!body.ok) return cappedBodyError(body, 'Invalid request.');

  let parsed;
  try {
    parsed = voidSchema.parse(body.value);
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  // Only a still-valid ticket can be voided; an admitted one is history.
  const { data, error } = await supabase
    .from('tickets')
    .update({ status: 'void' })
    .eq('id', parsed.ticketId)
    .eq('status', 'valid')
    .select('id, code')
    .maybeSingle();

  if (error) {
    console.error('void failed:', error);
    return NextResponse.json({ error: 'Void failed.' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Ticket not found or not voidable.' }, { status: 404 });
  }

  await supabase.from('settings_audit').insert({
    actor_id: auth.staff.id,
    field: 'ticket_void',
    old_value: data.code,
    new_value: parsed.reason,
  });

  return NextResponse.json({ ok: true });
}
