'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Clock,
  Ticket as TicketIcon,
  CheckCircle2,
} from 'lucide-react';
import { eventConfig } from '@/config/event.config';
import { CheckoutValues, PurchaseState, Order, Ticket } from '@/types/ticketing';
import { CheckoutForm } from '@/components/CheckoutForm';
import { WhatsAppSupportButton } from '@/components/WhatsAppSupportButton';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  initiatePurchase,
  confirmPurchase,
  listOrders,
  getOrderByReference,
  getPublicSalesCounter,
} from '@/lib/data-access';
import { IS_DEV } from '@/lib/dev-mode';
import { useDevState } from '@/components/dev/DevStateProvider';

export const CheckoutPage: React.FC = () => {
  const { forcedPurchaseState: forcedState, setForcedPurchaseState } = useDevState();
  const onResetForcedState = () => setForcedPurchaseState(undefined);
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  // Internal state when not overridden by dev switcher
  const [internalState, setInternalState] = useState<PurchaseState>({ status: 'idle' });
  // Reference of the in-flight purchase, so the dev simulate buttons can
  // confirm the real order rather than reaching for a mock fixture.
  const [activeReference, setActiveReference] = useState<string | null>(null);
  // Suppresses a flash of the purchase form before availability is known. A
  // buyer starting to type into a form that then vanishes is worse than a
  // brief spinner. Becomes a server-side check in Session 1, at which point
  // this gate can go.
  const [availabilityChecked, setAvailabilityChecked] = useState<boolean>(false);

  // Whether the form can be shown at all. Without this the sales_closed and
  // sold_out screens existed but nothing ever reached them — the admin toggle
  // would have been invisible to buyers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summary = await getPublicSalesCounter();
        if (cancelled) return;
        if (summary.salesClosed) {
          setInternalState({ status: 'sales_closed' });
        } else if (summary.isSoldOut) {
          setInternalState({ status: 'sold_out' });
        }
      } catch {
        // Leave the form up. A failed availability check must not block a
        // sale — the server re-checks authoritatively at submit time.
      } finally {
        if (!cancelled) setAvailabilityChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Active state priority: dev switcher forced state > internal state
  const purchaseState = forcedState || internalState;

  const setPurchaseState = (newState: PurchaseState) => {
    if (onResetForcedState) {
      onResetForcedState();
    }
    setInternalState(newState);
  };

  const handleFormSubmit = async (values: CheckoutValues) => {
    setPurchaseState({ status: 'validating' });
    try {
      const res = await initiatePurchase({
        buyerName: values.fullName,
        buyerEmail: values.email,
        buyerPhone: values.phone,
        quantity: values.quantity,
      });

      setActiveReference(res.reference);
      setPurchaseState({
        status: 'redirecting',
        authorizationUrl: res.authorizationUrl,
      });

      // Hand off to Paystack's hosted checkout. Paystack redirects back to
      // /ticket/[reference], where the server verifies payment — this client
      // never decides payment status.
      window.location.assign(res.authorizationUrl);
    } catch (err: any) {
      if (err?.code === 'sold_out') {
        setPurchaseState({ status: 'sold_out' });
      } else if (err?.code === 'sales_closed') {
        setPurchaseState({ status: 'sales_closed' });
      } else {
        setPurchaseState({
          status: 'error',
          message: err.message || 'Unable to process purchase. Please retry.',
        });
      }
    }
  };

  const handleRetry = () => {
    setPurchaseState({ status: 'idle' });
  };

  /**
   * DEV ONLY. Jumps straight to the success state without a live Paystack
   * round-trip. Goes through the data-access seam like everything else.
   */
  const simulatePaymentSuccess = async () => {
    try {
      if (activeReference) {
        const confirmed = await confirmPurchase(activeReference);
        setPurchaseState({ status: 'success', ...confirmed });
        return;
      }
      // Forced into this state by the dev switcher, so there is no live
      // reference — fall back to the most recent paid order.
      const { orders } = await listOrders({ status: 'paid', limit: 1 });
      if (!orders[0]) throw new Error('No paid order available to preview');
      const result = await getOrderByReference(orders[0].reference);
      if (!result) throw new Error('Order reference not found');
      setPurchaseState({ status: 'success', ...result });
    } catch (err: any) {
      setPurchaseState({
        status: 'error',
        message: err?.message || 'Unable to load a sample order.',
      });
    }
  };

  return (
    <main className="min-h-screen bg-brand-surface text-brand-text py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Top navigation */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            id="checkout-back-link"
            className="inline-flex items-center gap-2 min-h-[48px] px-3 py-2 text-sm font-semibold text-brand-muted hover:text-brand-text transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Event Details</span>
          </Link>
          <span className="text-xs font-mono font-semibold text-brand-primary uppercase">
            Step 1 of 2 • Reservation
          </span>
        </div>

        {/* ========================================================
            STATE 1: REDIRECTING (Full-screen Interstitial)
        ======================================================== */}
        {purchaseState.status === 'redirecting' && (
          <div
            id="state-redirecting-interstitial"
            className="max-w-xl mx-auto my-12 p-8 sm:p-12 rounded-3xl bg-brand-card border border-brand-border text-center shadow-2xl space-y-6"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-subtle text-brand-primary flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-brand-accent mb-2 inline-block">
                Paystack Secure Transfer
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-text">
                Taking you to Paystack...
              </h1>
              <p className="text-base text-brand-muted mt-2 leading-relaxed">
                We are securing your ticket reservation and transferring you to Paystack's encrypted payment page.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-brand-subtle border border-brand-border text-xs text-brand-dim space-y-1">
              <p className="font-semibold text-brand-text">Please do not refresh or close this tab.</p>
              <p>Your session is protected with 256-bit SSL encryption.</p>
            </div>

            <div className="pt-2 flex flex-col gap-3">
              {IS_DEV && (
                <button
                  type="button"
                  id="redirect-simulated-success-btn"
                  onClick={() => {
                    setPurchaseState({ status: 'confirming' });
                    setTimeout(simulatePaymentSuccess, 1000);
                  }}
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-brand-primary text-brand-surface font-bold text-sm hover:bg-brand-primary-hover transition-colors"
                >
                  Simulate Payment Complete → (dev)
                </button>
              )}
              <WhatsAppSupportButton label="Payment assistance on WhatsApp" />
            </div>
          </div>
        )}

        {/* ========================================================
            STATE 2: CONFIRMING (Verification Interstitial)
        ======================================================== */}
        {purchaseState.status === 'confirming' && (
          <div
            id="state-confirming-interstitial"
            className="max-w-xl mx-auto my-12 p-8 sm:p-12 rounded-3xl bg-brand-card border border-brand-border text-center shadow-2xl space-y-6"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-subtle text-brand-accent flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-brand-primary mb-2 inline-block">
                Finalizing Order
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-text">
                Confirming your payment...
              </h1>
              <p className="text-base text-brand-muted mt-2 leading-relaxed">
                Verifying transaction status with your bank and minting your digital passes.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-brand-subtle border border-brand-border text-xs text-brand-dim space-y-1">
              <p className="font-semibold text-brand-urgent">Please DO NOT close or reload this tab.</p>
              <p>Your tickets are being finalized and registered.</p>
            </div>

            {IS_DEV && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={simulatePaymentSuccess}
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-brand-accent text-brand-surface font-bold text-sm hover:opacity-90 transition-opacity"
                >
                  Proceed to Issued Tickets → (dev)
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            STATE 3: SUCCESS (Order Confirmed View)
        ======================================================== */}
        {purchaseState.status === 'success' && (
          <div
            id="state-success-view"
            className="max-w-xl mx-auto my-8 p-8 sm:p-10 rounded-3xl bg-brand-card border border-brand-border text-center shadow-2xl space-y-6"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-success-bg text-brand-success flex items-center justify-center border border-brand-success-border">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-brand-success mb-2 inline-block">
                Payment Confirmed
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-text">
                You're In! See You at The Final Lap!
              </h1>
              <p className="text-base text-brand-muted mt-2 leading-relaxed">
                Your ticket order has been confirmed and registered for {eventConfig.event.name}.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-brand-subtle border border-brand-border text-sm space-y-1">
              <span className="text-xs uppercase font-bold text-brand-muted">Order Reference</span>
              <p className="font-mono text-lg font-bold text-brand-primary">
                {purchaseState.order.reference}
              </p>
              {/* Email is now genuinely sent, but it is the backup channel and
                  it can bounce — so it is described as a copy, not as the
                  delivery. The pass on this screen is the thing that matters,
                  and the wording keeps the buyer's attention on saving it. */}
              <p className="text-xs text-brand-dim mt-1">
                Save this reference. Your pass link works any time, on any device — and
                a copy is on its way to your email.
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <Link
                href={`/ticket/${purchaseState.order.reference}`}
                id="view-ticket-btn"
                className="min-h-[52px] px-6 py-3.5 rounded-xl bg-brand-primary text-brand-surface font-extrabold text-base flex items-center justify-center gap-2 hover:bg-brand-primary-hover transition-colors shadow-lg shadow-brand-primary/20"
              >
                <TicketIcon className="w-5 h-5" />
                <span>View {purchaseState.tickets.length} Digital Pass{purchaseState.tickets.length > 1 ? 'es' : ''} →</span>
              </Link>

              <WhatsAppSupportButton
                orderRef={purchaseState.order.reference}
                label="Help with this order on WhatsApp"
              />
            </div>
          </div>
        )}

        {/* ========================================================
            STATE 4: SOLD OUT INTERSTITIAL
        ======================================================== */}
        {purchaseState.status === 'sold_out' && (
          <div
            id="state-sold-out-view"
            className="max-w-xl mx-auto my-8 p-8 sm:p-10 rounded-3xl bg-brand-card border border-brand-border text-center shadow-2xl space-y-6"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-urgent-bg text-brand-urgent flex items-center justify-center border border-brand-urgent-border">
              <AlertCircle className="w-9 h-9" />
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-brand-urgent mb-2 inline-block">
                Capacity Reached
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-text">
                Tickets Are Sold Out!
              </h1>
              <p className="text-base text-brand-muted mt-2 leading-relaxed">
                All {eventConfig.ticketing.capacity} tickets for {eventConfig.event.name} have been claimed by graduating engineers.
              </p>
            </div>

            {/* There was a "cancellation waitlist" form here. It stored
                nothing, notified nobody and had no table behind it — it
                collected a phone number and dropped it. Someone who missed
                out would have walked away believing they were on a list.
                The WhatsApp desk below is a channel that actually reaches a
                human, so it is the only offer made. */}
            <div className="p-6 rounded-2xl bg-brand-subtle border border-brand-border text-left space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-brand-text">
                If a spot opens up
              </h3>
              <p className="text-xs text-brand-muted leading-relaxed">
                There is no automatic waitlist. Message the organisers on WhatsApp and
                they will tell you directly whether any passes have come back.
              </p>
            </div>

            <div className="pt-2">
              <WhatsAppSupportButton label="Message the organisers on WhatsApp" />
            </div>
          </div>
        )}

        {/* ========================================================
            STATE 5: SALES CLOSED
        ======================================================== */}
        {purchaseState.status === 'sales_closed' && (
          <div
            id="state-sales-closed-view"
            className="max-w-xl mx-auto my-8 p-8 sm:p-10 rounded-3xl bg-brand-card border border-brand-border text-center shadow-2xl space-y-6"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-subtle text-brand-muted flex items-center justify-center border border-brand-border">
              <Clock className="w-9 h-9" />
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-brand-muted mb-2 inline-block">
                Registration Ended
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-text">
                Ticket Sales Are Now Closed
              </h1>
              <p className="text-base text-brand-muted mt-2 leading-relaxed">
                Online ticket sales for {eventConfig.event.name} are closed. Passes may
                still be available at the door &mdash; message the organisers to check.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-brand-subtle border border-brand-border text-xs text-brand-dim">
              <p>For urgent gate inquiries or already-purchased pass lookup:</p>
            </div>

            <div className="pt-2">
              <WhatsAppSupportButton label="WhatsApp Organizers Gate Support" />
            </div>
          </div>
        )}

        {/* ========================================================
            STATE 6: ERROR (Payment Failed / Network Issue)
        ======================================================== */}
        {purchaseState.status === 'error' && (
          <div
            id="state-error-view"
            className="max-w-xl mx-auto my-8 p-8 sm:p-10 rounded-3xl bg-brand-card border border-brand-urgent-border text-center shadow-2xl space-y-6"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-urgent-bg text-brand-urgent flex items-center justify-center border border-brand-urgent-border">
              <AlertCircle className="w-9 h-9" />
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-brand-urgent mb-2 inline-block">
                Payment Interrupted
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-text">
                Transaction Could Not Complete
              </h1>
              <p className="text-base text-brand-muted mt-2 leading-relaxed">
                {purchaseState.message || 'Your bank did not authorize the charge or the connection timed out.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-brand-subtle border border-brand-border text-xs text-brand-dim text-left space-y-1.5">
              <p className="font-semibold text-brand-text">What to do next:</p>
              <ul className="list-disc list-inside space-y-1 text-brand-muted">
                <li>Check your account balance and retry payment.</li>
                <li>Try selecting "Pay with Bank Transfer" or USSD on Paystack.</li>
                <li>Your selected ticket allocation has not been lost.</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                id="error-retry-btn"
                onClick={handleRetry}
                className="flex-1 min-h-[48px] px-6 py-3 rounded-xl bg-brand-primary text-brand-surface font-bold text-sm hover:bg-brand-primary-hover transition-colors"
              >
                Retry Checkout
              </button>
              <WhatsAppSupportButton label="Get Help on WhatsApp" />
            </div>
          </div>
        )}

        {/* ========================================================
            DEFAULT STATE: IDLE & VALIDATING (The Checkout Form)
        ======================================================== */}
        {!availabilityChecked && purchaseState.status === 'idle' && !forcedState && (
          <div
            id="checkout-availability-check"
            className="max-w-xl mx-auto my-12 p-8 rounded-3xl bg-brand-card border border-brand-border text-center space-y-4"
          >
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-brand-primary" />
            <p className="text-sm text-brand-muted">Checking ticket availability&hellip;</p>
          </div>
        )}

        {(availabilityChecked || forcedState) &&
          (purchaseState.status === 'idle' || purchaseState.status === 'validating') && (
          <div>
            <div className="mb-8 text-center sm:text-left">
              <span className="text-xs font-bold uppercase tracking-widest text-brand-primary">
                Official Reservation Portal
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-brand-text mt-1">
                Get Your Sign-Out Ticket
              </h1>
              <p className="text-sm sm:text-base text-brand-muted mt-1">
                {eventConfig.event.name} • {eventConfig.event.date}
              </p>
            </div>

            <CheckoutForm
              onSubmit={handleFormSubmit}
              purchaseState={purchaseState}
            />
          </div>
        )}
      </div>
    </main>
  );
};
