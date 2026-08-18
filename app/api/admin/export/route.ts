import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api/staff-guard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * ADMIN ONLY. ~400 identifiable people's names, emails and phone numbers in
 * one response — every export writes an audit row saying who pulled it.
 */

function csvField(value: unknown): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const auth = await requireStaff('admin');
  if ('error' in auth) return auth.error;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('orders')
    .select('reference, buyer_name, buyer_email, buyer_phone, quantity, total_kobo, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('export failed:', error);
    return NextResponse.json({ error: 'export failed' }, { status: 500 });
  }

  await supabase.from('settings_audit').insert({
    actor_id: auth.staff.id,
    field: 'orders_csv_export',
    old_value: null,
    new_value: `${data?.length ?? 0} rows`,
  });

  const headers = ['Order Reference', 'Buyer Name', 'Email', 'Phone', 'Quantity', 'Total NGN', 'Status', 'Date'];
  const rows = (data ?? []).map((o) =>
    [o.reference, o.buyer_name, o.buyer_email, o.buyer_phone, o.quantity, o.total_kobo / 100, o.status, o.created_at]
      .map(csvField)
      .join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="orders.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
