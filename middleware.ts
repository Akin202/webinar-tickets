import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { DEVICE_COOKIE, readDeviceId, issueDeviceId } from '@/lib/api/device-id';

/**
 * The gate in front of the two tools. /admin and /scan require a signed-in
 * session; the login pages themselves are open. Role enforcement stays where
 * it already lives — inside the SECURITY DEFINER functions and the API
 * routes' requireStaff — so this layer only answers "is anyone signed in",
 * which keeps it fast and keeps authorisation from having two sources of
 * truth.
 *
 * Also performs the @supabase/ssr session refresh so tokens stay valid
 * across the event night.
 *
 * Since the WhatsApp/Twitter spike it additionally stamps a signed device
 * cookie on the two public pages, so the checkout rate limits can key on a
 * device instead of on an IP that a whole carrier shares. See lib/api/device-id.ts.
 */

/**
 * The pages a buyer sees BEFORE they can post a checkout. Issuing the cookie
 * here rather than in the API means a real buyer always arrives at
 * /api/checkout carrying one, and a script that posts straight at the endpoint
 * never does — which is what makes the no-cookie bucket meaningful.
 */
const PUBLIC_DEVICE_PATHS = new Set(['/', '/checkout']);

async function withDeviceCookie(
  request: NextRequest,
  response: NextResponse
): Promise<NextResponse> {
  // Re-stamping a valid cookie on every page view would reset the identity we
  // are trying to keep stable, so a request that already has one is left alone.
  if (await readDeviceId(request)) return response;

  const issued = await issueDeviceId();
  if (issued) response.cookies.set(DEVICE_COOKIE, issued.value, issued.options);
  return response;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/scan/login' || pathname === '/admin/login';

  // FIRST, and before anything touching Supabase. This runs on the buyer's
  // LCP path, and supabase.auth.getUser() below is a network round-trip that
  // must never happen there. Cost here is one HMAC and a Set-Cookie.
  if (PUBLIC_DEVICE_PATHS.has(pathname)) {
    return withDeviceCookie(request, response);
  }

  // One redirect, shared by both ways of failing below, so a missing env var
  // and a missing session cannot drift into behaving differently.
  const redirectToLogin = () => {
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith('/admin') ? '/admin/login' : '/scan/login';
    url.search = '';
    return NextResponse.redirect(url);
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // FAIL CLOSED — do not "return response" here. Without Supabase config this
  // gate cannot tell who is signed in, and the answer to "I don't know" must
  // be "no". Letting the request through would render /admin — which lists
  // ~400 buyers' names, emails and phone numbers — to anyone who asks, off
  // nothing worse than a missing env var. The login pages stay reachable so
  // there is no redirect loop.
  if (!supabaseUrl || !supabaseKey) {
    return isLoginPage ? response : redirectToLogin();
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser(), not getSession(): validates the JWT against the auth server
  // instead of trusting whatever cookie the client sent.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isLoginPage) {
    return redirectToLogin();
  }

  return response;
}

export const config = {
  // The two tool surfaces, plus the two public pages that mint the device
  // cookie. Ticket pages and API routes stay outside: the APIs carry their own
  // guards, and running the auth path on the party pages would slow down every
  // buyer — which is exactly why the device branch above returns before it.
  //
  // '/' and '/checkout' are exact paths, so no static asset under /_next is
  // matched and the LCP payload is untouched.
  matcher: ['/', '/checkout', '/admin/:path*', '/admin', '/scan/:path*', '/scan'],
};
