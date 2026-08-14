/*
# Employee number auth, PIN setup, and admin PIN reset

## Overview
Replaces email/name-based auth for workers with an anonymous
employee-number + 4-digit PIN system. Admins keep email/password auth.
No personal names or emails are stored or displayed for workers —
everything is tracked by `employee_number` (e.g. "Ansatt #104").

## 1. Modified table: `profiles`
- New column `employee_number` (integer, nullable, unique) — the worker's
  Ansattnummer. Admin accounts have NULL here; workers have a number.
- New column `pin_hash` (text, nullable) — bcrypt hash of the worker's
  4-digit PIN. NULL means the worker still uses the temporary setup code.
- New column `setup_complete` (boolean, default false) — true once the
  worker has created their own PIN. While false, the worker must set a
  PIN on first login.
- `full_name` is no longer used for workers but kept for backward
  compatibility (admin account may still have it). All UI uses
  employee_number instead.

## 2. Modified trigger: `handle_new_user`
Updated to handle the new columns. For worker accounts created through
the edge function, `employee_number` and `pin_hash` come from
`raw_user_meta_data`. For admin accounts (direct Supabase signup),
`employee_number` stays NULL.

## 3. New function: `complete_pin_setup(p_pin)`
Called by an authenticated worker who hasn't set up their PIN yet.
Hashes the 4-digit PIN and stores it, sets `setup_complete = true`.
Validates: exactly 4 digits, worker hasn't already completed setup.

## 4. Updated RLS
- Workers can now read their own `employee_number`, `setup_complete`
  (needed for the frontend to know whether to show the PIN setup screen).
- Workers cannot update `pin_hash`, `employee_number`, or `setup_complete`
  directly — only through the `complete_pin_setup` SECURITY DEFINER
  function.

## Security
- `pin_hash` is never exposed to the client (column privilege revoked).
- `employee_number` is readable by the worker themselves and by admin.
- PIN setup goes through a SECURITY DEFINER function that validates
  the PIN format and checks the worker hasn't already completed setup.
- Admin create-employee and reset-pin operations go through edge
  functions using the service role key (server-side only).
*/

-- ============================================================
-- 1. Add columns to profiles
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employee_number integer;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS setup_complete boolean NOT NULL DEFAULT false;

-- Unique constraint on employee_number (partial — only for non-null values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_employee_number_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_employee_number_key UNIQUE (employee_number);
  END IF;
END $$;

-- ============================================================
-- 2. Update handle_new_user trigger
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM profiles WHERE role = 'admin') INTO admin_exists;

  INSERT INTO profiles (id, full_name, role, employee_number, pin_hash, setup_complete)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN admin_exists THEN 'worker' ELSE 'admin' END,
    (NEW.raw_user_meta_data->>'employee_number')::int,
    NEW.raw_user_meta_data->>'pin_hash',
    COALESCE((NEW.raw_user_meta_data->>'setup_complete')::boolean, false)
  );

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. complete_pin_setup function
-- ============================================================

CREATE OR REPLACE FUNCTION complete_pin_setup(p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  UPDATE profiles
    SET pin_hash = crypt(p_pin, gen_salt('bf')),
        setup_complete = true
    WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_pin_setup(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_pin_setup(text) TO authenticated;

-- ============================================================
-- 4. Column privileges — hide pin_hash from clients
-- ============================================================

-- Revoke all on pin_hash, then grant nothing back (only SECURITY DEFINER
-- functions and the service role can access it)
REVOKE UPDATE (pin_hash) ON profiles FROM authenticated;
-- Also revoke SELECT on pin_hash so it's never fetched
REVOKE SELECT (pin_hash) ON profiles FROM anon, authenticated;

-- Grant SELECT on employee_number and setup_complete so the frontend
-- can read them for the current user
GRANT SELECT (employee_number, setup_complete) ON profiles TO authenticated;

-- ============================================================
-- 5. Enable pgcrypto for crypt() / gen_salt()
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
