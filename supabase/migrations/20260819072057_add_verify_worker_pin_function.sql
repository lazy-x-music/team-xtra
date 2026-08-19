/*
# Add verify_worker_pin database function

## Problem
Worker login used `supabase.auth.signInWithPassword` with the PIN as the
password. When a worker changed their PIN during setup, the `pin_hash`
column was updated but the Supabase auth password was often not synced
(edge function failures were silently ignored). This left workers unable
to log in with their new PIN — the old PIN still worked.

## Fix — Option A
Validate the PIN directly against `profiles.pin_hash` using a new
SECURITY DEFINER function `verify_worker_pin`. This function:
1. Looks up the profile by `employee_number`.
2. Checks `setup_complete = true` (the worker has set their own PIN).
3. Compares the supplied PIN against `pin_hash` using `crypt()`.
4. Returns the auth user's UUID on success, or NULL on failure.

The caller (edge function) then uses the service role key to sign in
as that user and return a session. The Supabase auth password is no
longer the source of truth for worker PINs — `pin_hash` is.

## Security
- `pin_hash` is accessed only inside this SECURITY DEFINER function
  (column privileges remain revoked for anon/authenticated).
- The function returns only the user UUID — no hash, no profile data.
- Execute is granted to `authenticated` (the edge function calls it
  via the service role client, which bypasses RLS/GRANT checks anyway).
*/

CREATE OR REPLACE FUNCTION verify_worker_pin(p_employee_number integer, p_pin text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT id, pin_hash, setup_complete
    INTO v_profile
    FROM profiles
    WHERE employee_number = p_employee_number AND role = 'worker';

  IF v_profile.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Worker must have completed PIN setup
  IF v_profile.setup_complete IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- Verify the PIN against the stored bcrypt hash
  IF v_profile.pin_hash IS NOT NULL
     AND extensions.crypt(p_pin, v_profile.pin_hash) = v_profile.pin_hash THEN
    RETURN v_profile.id;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION verify_worker_pin(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION verify_worker_pin(integer, text) TO authenticated;
