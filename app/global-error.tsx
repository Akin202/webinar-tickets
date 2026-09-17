'use client';

import { useEffect } from 'react';
import { eventConfig } from '@/config/event.config';

/**
 * The last-resort boundary: a crash in the root layout itself, which replaces
 * the entire document including <html> and <body>.
 *
 * Everything here is inline-styled and dependency-free on purpose. This file
 * renders in exactly the situation where the stylesheet, the fonts, or the
 * theme provider may be the thing that failed — importing them would risk the
 * error page dying the same way the page did. A shared component and a
 * Tailwind class are both bets that the app is partly working; at this point
 * that bet has already lost once.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('root layout error:', error);
  }, [error]);

  const phone = eventConfig.support.whatsappNumber.replace(/\D/g, '');
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(
    eventConfig.support.whatsappMessage
  )}`;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.25rem',
          padding: '1.5rem',
          textAlign: 'center',
          background: '#081028',
          color: '#f5f7fa',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '2.25rem', margin: 0, fontWeight: 800, letterSpacing: '-0.02em' }}>
          The page couldn&apos;t load.
        </h1>
        <p style={{ maxWidth: '32rem', lineHeight: 1.5, margin: 0, opacity: 0.85 }}>
          The page could not load at all. <strong>If you were paying, do not pay
          again</strong> — message us and we will check whether it went through.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 48,
              padding: '0 2rem',
              borderRadius: 10,
              border: 0,
              background: '#e3173e',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              minHeight: 48,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 2rem',
              borderRadius: 10,
              border: '1px solid #f5f7fa',
              color: '#f5f7fa',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Get help on WhatsApp
          </a>
        </div>

        {error.digest ? (
          <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem', opacity: 0.6 }}>
            Reference: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
