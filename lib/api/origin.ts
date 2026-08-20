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

/**
 * Rejects cross-site GETs, for the cookie-authenticated reads that no other
 * site has any business triggering.
 *
 * Deliberately NOT assertSameOrigin: browsers do not send `Origin` on a
 * same-origin GET, so that helper's missing-origin rejection would refuse the
 * admin's own fetch. `Sec-Fetch-Site` is sent on every request by every
 * current browser and, like Origin, is forbidden to page JavaScript.
 *
 * Scope, honestly stated: this does not stop a data leak. A hostile page
 * cannot read the response of a cross-site fetch anyway — the same-origin
 * policy already handles that, and this route sets no CORS headers. What it
 * stops is a hostile page silently burning an admin's export rate limit and
 * writing junk into the audit trail, which is the thing that would make the
 * audit trail useless in an actual incident.
 *
 * `none` (a typed URL or bookmark) and `same-site` are allowed. An absent
 * header — an older browser, or curl — is allowed too, because the staff
 * session check is the real gate and failing closed here would lock out a
 * legitimate admin on event night for no security gain.
 */
export function assertNotCrossSite(req: Request): NextResponse | null {
  if (req.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  }
  return null;
}
