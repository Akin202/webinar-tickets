'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { eventConfig } from '@/config/event.config';
import { WhatsAppSupportButton } from '@/components/WhatsAppSupportButton';
import { typographic } from '@/components/pages/event/event-format';

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
    <main className="public-page min-h-screen bg-brand-surface text-brand-text flex flex-col items-start justify-center px-6 sm:px-12 gap-6 max-w-3xl mx-auto">
      <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight leading-[0.95] text-white">
        That didn’t work.
      </h1>
      <p className="text-base text-brand-muted max-w-md">
        Something on our side failed. <strong>If you were paying, do not pay
        again</strong> — message us and we will check whether it went through.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <button
          type="button"
          onClick={reset}
          className="min-h-[48px] px-6 py-3 rounded-[10px] bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold inline-flex items-center justify-center transition-colors"
        >
          Try again
        </button>
        <WhatsAppSupportButton label="Get help on WhatsApp" />
      </div>

      <Link href="/" className="text-sm text-brand-muted underline underline-offset-4">
        Back to {typographic(eventConfig.event.name)}
      </Link>

      {error.digest ? (
        <p className="font-mono-code text-xs text-brand-muted">
          Reference: {error.digest}
        </p>
      ) : null}
    </main>
  );
}
