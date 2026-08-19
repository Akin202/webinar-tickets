import { NextResponse } from 'next/server';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { ticketFromRow } from '@/lib/api/mappers';

/** ADMIN ONLY. */
export async function GET(req: Request) {
  const auth = await requireStaffRequest(req, 'admin');
  if ('error' in auth) return auth.error;

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const query = url.searchParams.get('query')?.trim();

  const supabase = getSupabaseAdminClient();
  let q = supabase
    .from('tickets')
    .select('*')
    .order('issued_at', { ascending: false })
    .limit(1000);

  if (status) q = q.eq('status', status);
  if (query) {
    const safe = query.replace(/[%,()]/g, ' ').trim();
    if (safe) {
      q = q.or(`code.ilike.%${safe}%,holder_name.ilike.%${safe}%,holder_phone.ilike.%${safe}%`);
    }
  }

  const { data, error } = await q;
  if (error) {
    console.error('tickets list failed:', error);
    return NextResponse.json({ error: 'list failed' }, { status: 500 });
  }
  return NextResponse.json({ tickets: (data ?? []).map(ticketFromRow) });
}
