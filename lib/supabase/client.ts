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
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}
