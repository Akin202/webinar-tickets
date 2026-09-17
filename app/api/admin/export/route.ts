import { NextResponse } from 'next/server';
import { requireStaffRequest } from '@/lib/api/staff-guard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIp } from '@/lib/api/rate-limit';
import { csvField } from '@/lib/api/csv';
import { assertNotCrossSite } from '@/lib/api/origin';

/**
 * ADMIN ONLY. ~400 identifiable people's names, emails and phone numbers in
 * one response — every export writes an audit row saying who pulled it.
 */

export async function GET(req: Request) {
  const crossSite = assertNotCrossSite(req);
  if (crossSite) return crossSite;

  const auth = await requireStaffRequest(req, 'admin');
  if ('error' in auth) return auth.error;

  // Tight, and deliberately tighter than the other admin routes: this single
  // endpoint returns the entire buyer list. A leaked admin session should not
  // be able to pull it in a loop.
  if (!rateLimit(`admin:export:${auth.staff.id}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many exports. Wait a minute.' }, { status: 429 });
  }
  if (!rateLimit(`admin:export:ip:${clientIp(req)}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many exports. Wait a minute.' }, { status: 429 });
  }

  const supabase = getSupabaseAdminClient();

  // Two datasets, one guarded endpoint: the buyer list, and the free
  // livestream list. They are never merged — a livestream row is not an order
  // and must not appear in a file anyone reconciles against Paystack.
  if (new URL(req.url).searchParams.get('dataset') === 'livestream') {
    return exportLivestream(supabase, auth.staff.id);
  }

  const { data, error } = await supabase
    .from('orders')
    .select('reference, buyer_name, buyer_email, buyer_phone, attendee_type, quantity, total_kobo, status, created_at')
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

  const headers = ['Order Reference', 'Buyer Name', 'Email', 'Phone', 'Attendee Type', 'Quantity', 'Total NGN', 'Status', 'Date'];
  const rows = (data ?? []).map((o) =>
    [o.reference, o.buyer_name, o.buyer_email, o.buyer_phone, o.attendee_type ?? '', o.quantity, o.total_kobo / 100, o.status, o.created_at]
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

async function exportLivestream(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  staffId: string
): Promise<NextResponse> {
  const { data, error } = await supabase
    .from('livestream_registrations')
    .select('name, email, phone, attendee_type, marketing_opt_in, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('livestream export failed:', error);
    return NextResponse.json({ error: 'export failed' }, { status: 500 });
  }

  // Same audit trail as the buyer export: this is still a list of real people.
  await supabase.from('settings_audit').insert({
    actor_id: staffId,
    field: 'livestream_csv_export',
    old_value: null,
    new_value: `${data?.length ?? 0} rows`,
  });

  const headers = ['Name', 'Email', 'Phone', 'Attendee Type', 'Marketing Opt-In', 'Registered At'];
  const rows = (data ?? []).map((r) =>
    [r.name, r.email, r.phone, r.attendee_type ?? '', r.marketing_opt_in ? 'yes' : 'no', r.created_at]
      .map(csvField)
      .join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="livestream.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
