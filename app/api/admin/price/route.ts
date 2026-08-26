import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { readCappedJson, cappedBodyError } from '@/lib/api/body-limit';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({ priceKobo: z.number().int().min(100).max(100_000_000) });

export async function POST(req: Request) {
  const auth = await requireStaffRequest(req, 'admin', { mutating: true, limit: 20 });
  if ('error' in auth) return auth.error;
  const body = await readCappedJson(req);
  if (!body.ok) return cappedBodyError(body, 'Invalid ticket price.');
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Price must be between ₦1 and ₦1,000,000.' }, { status: 400 });
  }
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc('set_ticket_price', { p_price_kobo: parsed.data.priceKobo });
  if (error) {
    // Every other admin route logs its failure; this one did not, which is why
    // a missing migration and a failed authorisation looked identical from the
    // browser — both were a bare 500.
    console.error('set_ticket_price failed:', error);
    if (error.code === '42501') {
      return NextResponse.json({ error: 'Only an admin may change the ticket price.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Could not update ticket price.' }, { status: 500 });
  }
  return NextResponse.json({ priceKobo: parsed.data.priceKobo });
}
