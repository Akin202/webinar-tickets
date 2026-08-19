/**
 * In-memory sliding-window rate limiter.
 *
 * Deliberately not Redis: one event, ~400 buyers, a single Vercel region.
 * Fluid Compute reuses instances, so this holds across most requests; a cold
 * start resets a window, which fails OPEN. That is the accepted trade-off —
 * the hard guarantees (capacity, idempotent payment) live in the database,
 * and this only takes the edge off abuse.
 */

const windows = new Map<string, number[]>();

const MAX_TRACKED_KEYS = 10_000; // memory ceiling

/**
 * Longest window any caller uses, so the sweep knows when a key is certainly
 * dead. Keep this >= the largest windowMs passed to rateLimit().
 */
const MAX_WINDOW_MS = 10 * 60_000;

/**
 * Drops keys whose most recent hit is older than any live window.
 *
 * Runs only when the map is over its ceiling. The previous eviction deleted
 * `windows.keys().next().value` — the first-*inserted* key, since Map.set on an
 * existing key does not reorder it. That is the longest-lived key, not the
 * stalest: under sustained load it evicted an actively rate-limited attacker
 * and kept expired entries, resetting the very window that was doing the work.
 */
function sweepExpired(now: number): void {
  for (const [key, hits] of windows) {
    if (hits.length === 0 || now - hits[hits.length - 1] >= MAX_WINDOW_MS) {
      windows.delete(key);
    }
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    windows.set(key, hits);
    return false;
  }

  hits.push(now);
  windows.set(key, hits);

  if (windows.size > MAX_TRACKED_KEYS) {
    sweepExpired(now);
    // Still over after sweeping: every key is live, so this is real load and
    // not stale accumulation. Drop the least recently active one.
    if (windows.size > MAX_TRACKED_KEYS) {
      let stalest: string | undefined;
      let stalestAt = Infinity;
      for (const [k, h] of windows) {
        const last = h[h.length - 1] ?? 0;
        if (last < stalestAt) {
          stalestAt = last;
          stalest = k;
        }
      }
      if (stalest !== undefined) windows.delete(stalest);
    }
  }
  return true;
}

/** Client IP for rate-limit keys. x-forwarded-for is set by Vercel's proxy. */
export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
