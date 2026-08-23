'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The browser client. Anon key only — everything it can reach is limited to
 * what RLS and the function grants allow: the public counter for anyone, and
 * the door/admin RPCs once a staff session exists. Session is persisted in
 * cookies (via @supabase/ssr) so middleware and route handlers can see it.
 *
 * Singleton: one GoTrue instance per tab, or concurrent refreshes race.
 */
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    // No placeholder fallback. A missing env var must fail loudly here rather
    // than booting a client pointed at a domain we do not own and surfacing as
    // confusing network errors later. Stays consistent with server.ts, which
    // asserts the same two vars the same way.
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}
