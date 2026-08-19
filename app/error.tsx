'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { eventConfig } from '@/config/event.config';
import { WhatsAppSupportButton } from '@/components/WhatsAppSupportButton';

/**
 * The route-segment error boundary.
 *
 * Without this, an unhandled render or data error fell through to Next's
 * default screen: no branding, no explanation, and — the part that actually
 * costs money — no way to reach a human. Someone mid-purchase who hits this
 * has to be able to finish the transaction by another route, which for this
 * event means WhatsApp.
 *
 * Deliberately does not print the error. A buyer cannot act on a stack trace,
 * and it may carry internals. The digest is shown because it is the one token
 * that lets us find their specific failure in the server log.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('unhandled route error:', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-brand-surface text-brand-text flex flex-col items-center justify-center px-6 text-center gap-6">
      <p className="font-mono-code text-sm uppercase tracking-widest text-brand-primary">
        Something broke
      </p>
      <h1 className="font-display text-5xl sm:text-7xl uppercase leading-[0.9] text-brand-text">
        That didn&apos;t work
      </h1>
      <p className="text-base text-brand-muted max-w-md">
        Something on our side failed. <strong>If you were paying, do not pay
        again</strong> — message us and we will check whether it went through.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <button
          type="button"
          onClick={reset}
          className="min-h-[48px] px-8 py-3 rounded-2xl bg-brand-primary text-brand-surface font-black uppercase tracking-wider inline-flex items-center"
        >
          Try again
        </button>
        <WhatsAppSupportButton label="Get help on WhatsApp" />
      </div>

      <Link href="/" className="text-sm text-brand-muted underline underline-offset-4">
        Back to {eventConfig.event.name}
      </Link>

      {error.digest ? (
        <p className="font-mono-code text-xs text-brand-muted">
          Reference: {error.digest}
        </p>
      ) : null}
    </main>
  );
}
