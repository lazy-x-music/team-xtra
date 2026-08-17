/*
# Make complete_pin_setup idempotent

## Problem
The function rejected calls when setup_complete was already true,
which blocked retries after a partial failure (RPC succeeded but
the edge function failed to update the auth password). The worker
was stuck: they couldn't save a new PIN because the DB said "already
set up", but they couldn't log in with their new PIN either because
the auth password was never updated.

## Fix
Remove the "PIN already set up" guard. Always update the pin_hash
and set setup_complete = true. This makes the function idempotent —
safe to call multiple times.
*/

CREATE OR REPLACE FUNCTION complete_pin_setup(p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Validate PIN format: exactly 4 digits
  IF p_pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits';
  END IF;

  -- Verify the caller's profile exists
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Hash the PIN and mark setup as complete.
  -- Idempotent: safe to call multiple times (e.g. after a retry).
  UPDATE profiles
    SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
        setup_complete = true
    WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_pin_setup(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_pin_setup(text) TO authenticated;
