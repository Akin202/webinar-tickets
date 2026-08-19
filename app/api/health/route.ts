import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { paystackReachable } from '@/lib/api/paystack';
import { rateLimit, clientIp } from '@/lib/api/rate-limit';

/**
 * Is the app able to sell a ticket right now?
 *
 * Answers with the two dependencies that can independently take the money
 * path down — Postgres and Paystack — because on event week the useful
 * question at 2am is "which one is broken", not "is something broken".
 *
 * Deliberately says nothing about versions, config, table names or error
 * detail: this is unauthenticated, so a failure reports only that it failed.
 * The real diagnostics go to the server log where only we can read them.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!rateLimit(`health:ip:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

  const [database, paystack] = await Promise.all([databaseReachable(), paystackReachable()]);
  const ok = database && paystack;

  return NextResponse.json(
    { ok, database, paystack, checkedAt: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}

async function databaseReachable(): Promise<boolean> {
  try {
    // get_public_counter is the one function that touches the real tables and
    // returns no money — the same surface the public page already reads.
    const { error } = await getSupabaseAdminClient().rpc('get_public_counter');
    if (error) {
      console.error('health: database unreachable', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('health: database check threw', err);
    return false;
  }
}
