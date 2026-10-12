import 'server-only';

import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { paystackVerify } from '@/lib/api/paystack';
import { deliverTicketEmail } from '@/lib/email';
import { logSettleOutcome } from '@/lib/api/settle-log';

export type VerifySource = 'verify' | 'cron';

/**
 * What asking Paystack about one reference achieved.
 * - `not_paid`: Paystack has no successful charge for it (yet). Nothing changed.
 * - `settled`: Paystack says paid and mark_order_paid answered with `outcome`.
 * - `settle_error`: Paystack says paid but the RPC errored — money taken and
 *   not recorded. Logged at error level; the next sweep retries it.
 */
export type VerifyAndSettleResult =
  | { kind: 'not_paid' }
  | { kind: 'settled'; outcome: string | undefined }
  | { kind: 'settle_error' };

/**
 * Ask Paystack directly whether a reference was paid and, if so, settle it
 * through the same idempotent mark_order_paid the webhook uses. Shared by the
 * lazy verify on /api/orders/[reference] and the settle-pending sweep, so the
 * two cannot drift apart. Throws if Paystack itself is unreachable.
 */
export async function verifyAndSettle(
  supabase: SupabaseClient,
  reference: string,
  source: VerifySource
): Promise<VerifyAndSettleResult> {
  const verified = await paystackVerify(reference);
  if (verified?.status !== 'success') return { kind: 'not_paid' };

  const { data: settled, error: settleError } = await supabase.rpc('mark_order_paid', {
    p_reference: reference,
    p_amount_kobo: verified.amountKobo,
    p_channel: verified.channel,
    p_raw: verified.raw,
  });

  // Paystack says this transaction succeeded, so a failure to settle it is
  // money we have taken and not recorded. The sweep retries the same call,
  // but if it keeps failing this log is the only trace.
  if (settleError) {
    console.error(`${source}: mark_order_paid errored on ${reference}`, settleError);
    return { kind: 'settle_error' };
  }

  // Whichever path lands second gets 'already_paid' and sends nothing, so the
  // ticket email goes out exactly once.
  const settledRow = Array.isArray(settled) ? settled[0] : settled;
  const outcome: string | undefined = settledRow?.outcome;
  logSettleOutcome(source, reference, verified.amountKobo, outcome);
  if (outcome === 'paid') {
    after(async () => {
      const result = await deliverTicketEmail(reference);
      if (!result.ok) console.error(`${source}: ticket email for ${reference} — ${result.reason}`);
    });
  }
  return { kind: 'settled', outcome };
}
