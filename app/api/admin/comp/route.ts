import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { normaliseNgPhone } from '@/types/ticketing';
import { ticketFromRow } from '@/lib/api/mappers';
import { generateReference } from '@/lib/api/reference';

const compSchema = z.object({
  holderName: z.string().trim().min(2).max(120),
  holderPhone: z.string().trim().max(20).nullable(),
});

/**
 * ADMIN ONLY. A complimentary ticket is a zero-value order pushed through the
 * SAME create_pending_order -> mark_order_paid path as a purchase: it fights
 * for capacity like everyone else, gets a properly generated code, and stays
 * separable in reconciliation because every money column is zero.
 */
export async function POST(req: Request) {
  const auth = await requireStaffRequest(req, 'admin', { mutating: true });
  if ('error' in auth) return auth.error;

  let parsed;
  try {
    parsed = compSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const holderPhone = parsed.holderPhone ? normaliseNgPhone(parsed.holderPhone) : null;
  if (holderPhone && !/^\+234[0-9]{10}$/.test(holderPhone)) {
    return NextResponse.json({ error: 'Enter a valid Nigerian phone number.' }, { status: 400 });
  }

  // Same unguessable generator as a real purchase. A comp reference is just as
  // much a bearer token for /ticket/[reference] as a paid one, and the old
  // millisecond-derived value was both enumerable and collision-prone.
  // Complimentary orders stay identifiable by their all-zero money columns and
  // the `complimentary` flag in raw_webhook, not by a guessable prefix.
  const reference = generateReference();
  const supabase = getSupabaseAdminClient();

  const { data: created, error: createError } = await supabase.rpc('create_pending_order', {
    p_reference: reference,
    p_buyer_name: parsed.holderName,
    p_buyer_email: 'comp@invalid.local',
    p_buyer_phone: holderPhone ?? '+2340000000000',
    p_quantity: 1,
    p_unit_price_kobo: 0,
    p_service_charge_kobo: 0,
    p_fee_kobo: 0,
    p_total_kobo: 0,
  });
  const createdRow = Array.isArray(created) ? created[0] : created;

  if (createError || !createdRow) {
    console.error('comp create failed:', createError);
    return NextResponse.json({ error: 'Could not issue ticket.' }, { status: 500 });
  }
  if (createdRow.outcome === 'sold_out') {
    return NextResponse.json({ error: 'No capacity remaining.' }, { status: 409 });
  }
  if (createdRow.outcome === 'sales_closed') {
    return NextResponse.json(
      { error: 'Sales are closed — reopen sales briefly to issue a complimentary ticket.' },
      { status: 409 }
    );
  }

  const { error: paidError } = await supabase.rpc('mark_order_paid', {
    p_reference: reference,
    p_amount_kobo: 0,
    p_channel: null,
    p_raw: { complimentary: true, issued_by: auth.staff.id },
  });
  if (paidError) {
    console.error('comp mint failed:', paidError);
    return NextResponse.json({ error: 'Could not issue ticket.' }, { status: 500 });
  }

  const { data: ticketRow, error: ticketError } = await supabase
    .from('tickets')
    .select('*, orders!inner(reference)')
    .eq('orders.reference', reference)
    .maybeSingle();

  if (ticketError || !ticketRow) {
    console.error('comp readback failed:', ticketError);
    return NextResponse.json({ error: 'Issued but could not read back.' }, { status: 500 });
  }

  return NextResponse.json({ ticket: ticketFromRow(ticketRow) });
}
