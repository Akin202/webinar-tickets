-- ============================================================================
-- Close the implicit PUBLIC execute grant on the privileged RPCs.
--
-- Postgres grants EXECUTE on every new function to PUBLIC by default, and
-- Supabase additionally grants anon/authenticated/service_role on new objects
-- in the `public` schema. The initial migration revoked this correctly for
-- private.current_staff_role() but not for the three privileged functions in
-- `public`, so anon could invoke them over /rest/v1/rpc/.
--
-- Nothing leaked: each function guards its own body (record_check_in and
-- set_sales_open raise 42501 before any write, and get_check_in_manifest
-- filters on current_staff_role() so anon matched zero rows). This is
-- defence-in-depth — an unauthenticated caller should not reach the function
-- at all, rather than reach it and be turned away inside.
--
-- get_public_counter deliberately stays reachable by anon: it is the one
-- surface the public page needs, and it returns counts only.
-- ============================================================================

revoke execute on function public.get_check_in_manifest()                     from public, anon;
revoke execute on function public.record_check_in(text, text, timestamptz)    from public, anon;
revoke execute on function public.set_sales_open(boolean)                     from public, anon;

-- Re-assert the intended grants so this migration is self-describing and
-- idempotent regardless of what default privileges did.
grant execute on function public.get_check_in_manifest()                  to authenticated;
grant execute on function public.record_check_in(text, text, timestamptz) to authenticated;
grant execute on function public.set_sales_open(boolean)                  to authenticated;

-- The anon counter: drop the blanket PUBLIC grant, keep the two explicit roles.
revoke execute on function public.get_public_counter() from public;
grant  execute on function public.get_public_counter() to anon, authenticated;
