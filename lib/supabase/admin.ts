import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The service-role client. Bypasses RLS by design — it exists so API routes
 * can call the SECURITY DEFINER money functions and serve the admin surface.
 *
 * `import 'server-only'` makes any client-component import a build error
 * rather than a leaked key. Never hand this client's results to a response
 * without an explicit authorisation check in the route.
 */
let adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not configured');
  }
  if (!adminClient) {
    adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
