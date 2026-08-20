import 'server-only';

/**
 * Every outcome `mark_order_paid` can return, logged in one place.
 *
 * Two paths settle an order — the Paystack webhook and the lazy verify on
 * /api/orders/[reference] — and they were reporting different subsets of the
 * same answers. `paid_no_capacity` and `conflict` were reported by neither,
 * despite migration 20260819012502 promising "an error-level log in the
 * webhook and verify routes". A buyer whose money landed but whose ticket was
 * never minted left a settings_audit row and nothing else.
 *
 * Anything that needs a human to open the Paystack dashboard logs at error
 * level, so it is greppable in Vercel's log drain.
 */
export type SettleOutcome =
  | 'paid'
  | 'already_paid'
  | 'amount_mismatch'
  | 'not_found'
  | 'paid_no_capacity'
  | 'conflict';

export function logSettleOutcome(
  source: 'webhook' | 'verify',
  reference: string,
  amountKobo: number,
  outcome: string | undefined
): void {
  switch (outcome) {
    case 'paid':
    case 'already_paid':
      return;

    case 'amount_mismatch':
      // Money arrived that does not match the order. Never mint on this —
      // resolve by hand against the Paystack dashboard.
      console.error(
        `${source}: AMOUNT MISMATCH on ${reference}: paystack says ${amountKobo}`
      );
      return;

    case 'paid_no_capacity':
      // The worst outcome in the system: real money took a seat that no longer
      // exists. The buyer is owed a refund and does not know it yet.
      console.error(
        `${source}: PAID BUT NOT MINTED on ${reference} (${amountKobo} kobo) — ` +
          `capacity was gone by the time payment settled. REFUND REQUIRED. ` +
          `See settings_audit for the full detail.`
      );
      return;

    case 'not_found':
      console.error(`${source}: charge.success for unknown reference ${reference}`);
      return;

    case 'conflict':
      // The order was in a status the settle path refuses to overwrite —
      // in practice 'refunded'. Someone paid against a refunded order.
      console.error(
        `${source}: CONFLICT on ${reference} — order is in a status that cannot ` +
          `be marked paid (most likely already refunded). Reconcile by hand.`
      );
      return;

    default:
      console.error(`${source}: unrecognised settle outcome ${outcome} on ${reference}`);
  }
}
