'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Cookie } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The essential-cookies notice on the two buyer pages.
 *
 * WHY A NOTICE AND NOT A CONSENT GATE. Everything this app stores is strictly
 * necessary — see lib/cookie-inventory.ts. There is no analytics, no ad tag and
 * no third party to switch off, so there is nothing a "Reject" button could
 * honestly do. It would either lie or disable the anti-abuse rate limiting that
 * keeps twenty invented phone numbers from holding the whole hall. A button
 * that silently does nothing is worse evidence of compliance than no button, so
 * this discloses and points at the full detail instead of pretending to ask.
 *
 * WHY IT RENDERS NOTHING ON THE SERVER. The public page has an LCP budget of
 * 2.5s on Slow 4G with 4x CPU throttle. This markup is deliberately absent from
 * the server-rendered HTML so it can never become the largest contentful paint
 * or compete for parse time with the hero, and it is `fixed` so it cannot shift
 * layout no matter how tall it wraps on a narrow screen.
 */

/**
 * localStorage, NOT a cookie. Setting a cookie to announce cookies is both
 * silly and an extra Set-Cookie on the LCP path. The `_v1` suffix is the
 * re-consent lever: bump it and everyone sees the notice once more.
 */
const DISMISSED_KEY = 'sot_cookie_notice_v1';

/**
 * Read by a bottom spacer on both buyer pages, so the page can always scroll
 * far enough that the notice never sits on top of the Pay button. A banner
 * that covers the money path on a live sales page is worse than no banner.
 */
const HEIGHT_VAR = '--cookie-notice-height';

export const CookieNotice: React.FC = () => {
  // Starts false on both server and client so the first client render matches
  // the server's empty output and hydration cannot mismatch.
  const [visible, setVisible] = useState(false);
  // Separate from `visible` so the entrance transition has two frames to run
  // between: mounted-but-transparent, then mounted-and-opaque.
  const [entered, setEntered] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      // Private mode with storage blocked. Showing the notice is the safe
      // failure: it is a disclosure, so erring toward displaying it is right.
    }
    setVisible(true);
  }, []);

  // Publish the height only once the bar is actually in the DOM, and clear it
  // on unmount so a dismissed notice cannot leave the buy bar floating.
  useEffect(() => {
    if (!visible) return;

    const element = barRef.current;
    if (!element) return;

    const root = document.documentElement;
    root.style.setProperty(HEIGHT_VAR, `${element.offsetHeight}px`);

    const frame = requestAnimationFrame(() => setEntered(true));

    return () => {
      cancelAnimationFrame(frame);
      root.style.removeProperty(HEIGHT_VAR);
    };
  }, [visible]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Storage blocked — the notice still closes for this page view. It will
      // reappear on the next one, which is annoying but not wrong.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      ref={barRef}
      id="cookie-notice"
      // role="region", deliberately not "dialog": this is not modal and must
      // not trap focus. Trapping a buyer inside a disclosure on the sales page
      // would be hostile, and nothing about a necessary-only notice requires it.
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-brand-border bg-brand-raised/98 backdrop-blur-xl px-4 py-3 sm:px-6 sm:py-4"
      style={{
        // transform + opacity only, per the motion rule.
        opacity: prefersReducedMotion || entered ? 1 : 0,
        transform:
          prefersReducedMotion || entered ? 'translateY(0)' : 'translateY(100%)',
        transition: prefersReducedMotion
          ? 'none'
          : 'opacity 0.2s ease, transform 0.2s ease',
      }}
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
        <Cookie
          className="w-5 h-5 text-brand-primary flex-shrink-0 hidden sm:block"
          aria-hidden="true"
        />

        <p className="text-xs sm:text-sm text-brand-muted leading-relaxed flex-1">
          We use a small number of{' '}
          <span className="text-brand-text font-semibold">essential cookies</span>{' '}
          to keep checkout secure and to stop ticket-buying abuse. No
          advertising, no tracking, no analytics.{' '}
          <Link
            href="/cookies"
            className="text-brand-primary underline underline-offset-2 hover:text-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface rounded"
          >
            What we store
          </Link>
        </p>

        <button
          type="button"
          onClick={dismiss}
          className="min-h-[44px] px-6 rounded-xl bg-brand-primary text-brand-surface font-extrabold text-sm uppercase tracking-wide flex-shrink-0 self-stretch sm:self-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface"
        >
          Got it
        </button>
      </div>
    </div>
  );
};
