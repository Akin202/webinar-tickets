import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyAndSettle } from '@/lib/api/settle';
import { sendTicketConfirmation } from '@/lib/ticket-confirmation';

/**
 * The settle-pending sweep. The FlagIQ Paystack business is shared by several
 * apps and Paystack allows one webhook URL per business, so this app cannot
 * count on the webhook. Instead, once a day (vercel.json; Vercel Hobby allows
 * no more often), ask Paystack about every recent unpaid order and settle the
 * ones it says were paid.
 *
 * This catches the buyer whose browser never came back from the popup: a bank
 * transfer that cleared after the tab was killed, a USSD payment finished on
 * another screen. The lazy verify on /api/orders/[reference] covers everyone
 * who does come back.
 *
 * 'abandoned' is included on purpose: create_pending_order flips unpaid
 * orders to abandoned after 10 minutes, and a bank transfer can take longer.
 * mark_order_paid accepts abandoned and re-checks capacity for it.
 */

// 48, not 24: Hobby fires a daily cron anywhere within its hour, so a 24-hour
// window could leave a gap between two runs.
const LOOKBACK_HOURS = 48;
// Newest first: the orders most likely to be mid-payment are the recent ones.
// Sequential calls, so this also bounds how hard one run leans on Paystack.
const MAX_PER_RUN = 150;

function isAuthorised(req: Request, secret: string): boolean {
  // Vercel Cron sends exactly this header when CRON_SECRET is set.
  const given = Buffer.from(req.headers.get('authorization') ?? '', 'utf8');
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('settle-pending: CRON_SECRET not configured');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }
  if (!isAuthorised(req, secret)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60_000).toISOString();
  const { data: rows, error } = await supabase
    .from('orders')
    .select('reference')
    .in('status', ['pending', 'abandoned'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_PER_RUN);

  if (error) {
    console.error('settle-pending: order lookup failed', error);
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  }

  let settled = 0;
  let failed = 0;
  for (const { reference } of (rows ?? []) as { reference: string }[]) {
    try {
      const attempt = await verifyAndSettle(supabase, reference, 'cron');
      if (attempt.kind === 'settled' && attempt.outcome === 'paid') settled += 1;
      if (attempt.kind === 'settle_error') failed += 1;
    } catch (err) {
      // One unreachable verify must not stop the rest; the next run retries.
      failed += 1;
      console.warn(`settle-pending: verify failed for ${reference}`, err);
    }
  }

  // Retry paid orders where confirmation email has not been sent and paid_at is older than 2 minutes
  const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: unsentRows, error: unsentError } = await supabase
    .from('orders')
    .select('id')
    .eq('status', 'paid')
    .is('confirmation_email_sent_at', null)
    .lte('paid_at', twoMinutesAgo)
    .order('paid_at', { ascending: false })
    .limit(MAX_PER_RUN);

  let confirmationsRetried = 0;
  if (unsentError) {
    console.error('settle-pending: unsent confirmations lookup failed', unsentError);
  } else {
    for (const { id } of (unsentRows ?? []) as { id: string }[]) {
      try {
        const res = await sendTicketConfirmation(id, supabase);
        if (res.ok && !res.skipped) confirmationsRetried += 1;
      } catch (err) {
        console.warn(`settle-pending: confirmation retry failed for order ${id}`, err);
      }
    }
  }

  return NextResponse.json({
    checked: rows?.length ?? 0,
    settled,
    failed,
    confirmationsRetried,
  });
}

