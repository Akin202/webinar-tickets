import { NextResponse } from 'next/server';

/**
 * Rejects cross-origin state-changing requests.
 *
 * The admin and door APIs authenticate from a Supabase session COOKIE, which
 * the browser attaches to any request it makes to this origin — including one
 * triggered by a form or fetch on someone else's page. Without this check, an
 * admin merely visiting a hostile link could have their browser void tickets or
 * close sales on their behalf.
 *
 * `Origin` is set by the browser on every cross-origin request and on all
 * same-origin POSTs, and cannot be forged by page JavaScript. We compare it
 * against the request's own Host rather than a configured URL so that preview
 * deployments, the *.vercel.app domain and localhost all work without an env
 * var that will be wrong exactly once, on launch day.
 *
 * A missing Origin is REJECTED on these routes. Browsers always send it for
 * cross-site POSTs, so absence means a non-browser client — curl, a script, a
 * server — and none of those should be driving a cookie-authenticated mutation.
 * Server-to-server callers (the Paystack webhook) authenticate by HMAC and must
 * not use this helper.
 */
export function assertSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get('origin');
  if (!origin) {
    return NextResponse.json({ error: 'Missing origin.' }, { status: 403 });
  }

  const host = req.headers.get('host');
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: 'Bad origin.' }, { status: 403 });
  }

  if (!host || originHost !== host) {
    return NextResponse.json({ error: 'Cross-origin request refused.' }, { status: 403 });
  }
  return null;
}
