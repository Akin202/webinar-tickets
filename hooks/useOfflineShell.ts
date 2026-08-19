'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Registers the door scanner's service worker and reports, honestly, whether
 * this phone would survive a reload with no network.
 *
 * Called only from `/scan`. The party page and the ticket page never register
 * a worker, so buyers carry none of this weight.
 *
 * `preparing` is the state to watch at the door: it means the shell is
 * downloading and the phone is NOT yet safe to take offline.
 */
export type OfflineShellStatus =
  /** No service worker API — private mode, or an ancient browser. */
  | 'unsupported'
  /** Registering, or pulling the shell into the cache. Do not go offline yet. */
  | 'preparing'
  /** Document and every script it needs are stored. A cold reload will render. */
  | 'ready'
  /** Something did not store. Treat exactly like `preparing`: not safe. */
  | 'incomplete';

export interface OfflineShell {
  status: OfflineShellStatus;
  /** Files stored / files the page asked for. Shown only when incomplete. */
  cached: number;
  total: number;
  /** Re-run the warm-up — used after lazily-loaded chunks arrive. */
  recheck: () => void;
}

/** Second pass, to pick up chunks that loaded after the first sweep. */
const RECHECK_DELAY_MS = 4000;

/**
 * Every same-origin build asset this page has actually pulled down.
 *
 * The worker cannot know these: it did not exist when the page loaded them,
 * and their names are content-hashed per build so they cannot be hardcoded.
 * The Resource Timing buffer is the accurate answer; the DOM sweep is a
 * backstop for the case where the buffer has been cleared or capped.
 */
function loadedBuildAssets(): string[] {
  const urls = new Set<string>();

  const keep = (value: string | null) => {
    if (!value) return;
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (!url.pathname.startsWith('/_next/static/')) return;
      urls.add(url.pathname + url.search);
    } catch {
      /* not a URL we can use */
    }
  };

  try {
    for (const entry of performance.getEntriesByType('resource')) keep(entry.name);
  } catch {
    /* Resource Timing unavailable — the DOM sweep below still works */
  }

  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((el) => keep(el.src));
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"], link[as="script"], link[as="style"]')
    .forEach((el) => keep(el.href));

  return [...urls];
}

export function useOfflineShell(): OfflineShell {
  const [status, setStatus] = useState<OfflineShellStatus>('preparing');
  const [cached, setCached] = useState(0);
  const [total, setTotal] = useState(0);
  const isMountedRef = useRef(true);

  const warm = useCallback(() => {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) return;
    controller.postMessage({ type: 'WARM_SHELL', urls: loadedBuildAssets() });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      setStatus('unsupported');
      return;
    }

    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; ready?: boolean; assets?: number; total?: number }
        | undefined;
      if (!data || data.type !== 'SHELL_STATUS' || !isMountedRef.current) return;
      setCached(data.assets ?? 0);
      setTotal(data.total ?? 0);
      setStatus(data.ready ? 'ready' : 'incomplete');
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    // The worker claims clients on activate, but that lands asynchronously —
    // without this the very first visit would warm nothing and report a
    // permanent "preparing".
    navigator.serviceWorker.addEventListener('controllerchange', warm);

    let recheckTimer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      try {
        // Scope '/' is required, not sloppy: the scanner's own scripts live
        // under /_next/static/, outside any /scan-rooted scope. See sw.js.
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch (err) {
        // Offline with a worker already installed is fine — fall through and
        // let `ready` resolve from the existing registration.
        console.warn('Service worker registration failed:', err);
      }

      try {
        await navigator.serviceWorker.ready;
      } catch {
        if (isMountedRef.current) setStatus('incomplete');
        return;
      }

      warm();
      recheckTimer = setTimeout(warm, RECHECK_DELAY_MS);
    })();

    return () => {
      isMountedRef.current = false;
      navigator.serviceWorker.removeEventListener('message', onMessage);
      navigator.serviceWorker.removeEventListener('controllerchange', warm);
      if (recheckTimer) clearTimeout(recheckTimer);
    };
  }, [warm]);

  return { status, cached, total, recheck: warm };
}
