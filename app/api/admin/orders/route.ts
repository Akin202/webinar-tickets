import { NextResponse } from 'next/server';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { orderFromRow } from '@/lib/api/mappers';

/** ADMIN ONLY. Paginated buyer list — this is the PII surface. */
export async function GET(req: Request) {
  const auth = await requireStaffRequest(req, 'admin');
  if ('error' in auth) return auth.error;

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const query = url.searchParams.get('query')?.trim();
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const supabase = getSupabaseAdminClient();
  let q = supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) q = q.eq('status', status);
  if (query) {
    // Escape PostgREST or-filter specials so a crafted search string stays a
    // search string.
    const safe = query.replace(/[%,()]/g, ' ').trim();
    if (safe) {
      q = q.or(
        `reference.ilike.%${safe}%,buyer_name.ilike.%${safe}%,buyer_phone.ilike.%${safe}%`
      );
    }
  }

  const { data, count, error } = await q;
  if (error) {
    console.error('orders list failed:', error);
    return NextResponse.json({ error: 'list failed' }, { status: 500 });
  }
  return NextResponse.json({ orders: (data ?? []).map(orderFromRow), total: count ?? 0 });
}
