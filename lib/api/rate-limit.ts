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

const MAX_TRACKED_KEYS = 10_000; // memory ceiling; oldest evicted first

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
    const oldest = windows.keys().next().value;
    if (oldest !== undefined) windows.delete(oldest);
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
