import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { rateLimit, clientIp } from '@/lib/api/rate-limit';
import { assertSameOrigin } from '@/lib/api/origin';
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

/** Generous — this is anti-runaway, not anti-user. An admin clicking around
 *  the dashboard does not come close. */
const ADMIN_LIMIT_PER_MIN = 60;

/**
 * The full gate for an admin route: origin, then rate limit, then identity.
 *
 * Checks are ordered cheapest-and-most-decisive first. The origin check runs
 * before any Supabase round-trip so a forged cross-site request costs nothing,
 * and the IP limit runs before auth so an unauthenticated flood is capped too
 * — a limiter that only counts authenticated calls does not protect the login
 * path it sits behind.
 *
 * `mutating` marks the state-changing routes (POST). Read-only GETs skip the
 * origin check: browsers omit `Origin` on plain navigations, and a GET that
 * changes nothing is not a CSRF target.
 */
export async function requireStaffRequest(
  req: Request,
  role: 'admin' | 'door' | 'any' = 'any',
  opts: { mutating?: boolean; limit?: number } = {}
): Promise<{ staff: StaffUser } | { error: NextResponse }> {
  if (opts.mutating) {
    const originError = assertSameOrigin(req);
    if (originError) return { error: originError };
  }

  const limit = opts.limit ?? ADMIN_LIMIT_PER_MIN;
  if (!rateLimit(`admin:ip:${clientIp(req)}`, limit, 60_000)) {
    return {
      error: NextResponse.json({ error: 'Too many requests. Slow down.' }, { status: 429 }),
    };
  }

  const auth = await requireStaff(role);
  if ('error' in auth) return auth;

  if (!rateLimit(`admin:staff:${auth.staff.id}`, limit, 60_000)) {
    return {
      error: NextResponse.json({ error: 'Too many requests. Slow down.' }, { status: 429 }),
    };
  }

  return auth;
}
