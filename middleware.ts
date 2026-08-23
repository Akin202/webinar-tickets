import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/scan/login' || pathname === '/admin/login';

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
  // Only the two tool surfaces. The public pages, ticket pages and API
  // routes are deliberately outside: the APIs carry their own guards, and
  // running auth middleware on the party pages would slow down every buyer.
  matcher: ['/admin/:path*', '/admin', '/scan/:path*', '/scan'],
};
