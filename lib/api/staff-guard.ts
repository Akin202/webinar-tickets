import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { StaffUser } from '@/types/ticketing';

/**
 * Route-handler authorisation gate for the admin API.
 *
 * Role comes from the staff_users TABLE via the get_current_staff RPC,
 * executed with the CALLER's session — never from JWT user_metadata, which is
 * user-editable. A valid session that has no staff_users row is a 403: being
 * logged in is not being staff.
 */
export async function requireStaff(
  role: 'admin' | 'door' | 'any' = 'any'
): Promise<{ staff: StaffUser } | { error: NextResponse }> {
  const supabase = await getSupabaseServerClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  }

  const { data, error } = await supabase.rpc('get_current_staff');
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return { error: NextResponse.json({ error: 'not staff' }, { status: 403 }) };
  }
  if (role !== 'any' && row.role !== role && row.role !== 'admin') {
    return { error: NextResponse.json({ error: `requires ${role} role` }, { status: 403 }) };
  }

  return { staff: { id: row.id, name: row.name, role: row.role } };
}
