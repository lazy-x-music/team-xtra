/*
# Lock down function execution grants

## Overview
Tightens who can call the server-side functions added in the previous
migration. `handle_new_user` is a trigger function only - it should never be
callable directly via the API, by anyone. The remaining Admin-only functions
must be callable by signed-in staff only, never by anonymous/unauthenticated
requests.

## Changes
- `handle_new_user`: all direct EXECUTE access revoked (still runs fine as a
  trigger, which does not require an EXECUTE grant).
- `is_admin`, `approve_application`, `remove_application`,
  `verify_application_hours`: EXECUTE explicitly revoked from `anon` and
  `public`, keeping only `authenticated`.
*/

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION approve_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_application(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION remove_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION remove_application(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION verify_application_hours(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION verify_application_hours(uuid, numeric) TO authenticated;
