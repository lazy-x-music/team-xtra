/*
# Fix complete_pin_setup: schema-qualify pgcrypto functions

## Problem
The `complete_pin_setup` function has `SET search_path TO 'public'`,
but `crypt()` and `gen_salt()` live in the `extensions` schema. When
the function runs, it cannot resolve these unqualified function names,
causing the "Kunne ikke lagre PIN-koden" error during worker onboarding.

## Fix
- Recreate `complete_pin_setup` with `search_path TO 'public', 'extensions'`
  so the pgcrypto functions are resolvable.
- Schema-qualify `extensions.crypt()` and `extensions.gen_salt()` as well
  for belt-and-suspenders safety.
- Add explicit error handling so failures produce a clear error message
  rather than a generic one.
*/

CREATE OR REPLACE FUNCTION complete_pin_setup(p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_existing boolean;
BEGIN
  -- Validate PIN format: exactly 4 digits
  IF p_pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits';
  END IF;

  -- Check worker hasn't already completed setup
  SELECT setup_complete INTO v_existing FROM profiles WHERE id = auth.uid();
  IF v_existing IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  IF v_existing THEN
    RAISE EXCEPTION 'PIN already set up';
  END IF;

  -- Hash the PIN using crypt() with bf (blowfish)
  -- Schema-qualified to ensure resolution regardless of search_path
  UPDATE profiles
    SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
        setup_complete = true
    WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_pin_setup(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_pin_setup(text) TO authenticated;
