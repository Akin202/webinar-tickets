import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cookie-bound server client: sees the caller's session, acts with the
 * caller's privileges. Use this in route handlers that need to know WHO is
 * asking (the admin guard). For privileged data access use the admin client —
 * never this one, and never leak service-role reads back through a handler
 * that has not checked the caller's role first.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware owns session refresh; safe to ignore here.
          }
        },
      },
    }
  );
}
