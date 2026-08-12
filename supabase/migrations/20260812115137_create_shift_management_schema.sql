/*
# Shift management schema for Aksell / Team Xtra

## Overview
Sets up the full data model for the shift management app: staff profiles with a
role (Admin or Worker), shifts that Admin creates, and worker applications to
those shifts (including approval, waitlist and post-shift hour verification).

## 1. New Tables

### `profiles`
One row per signed-up user, linked to Supabase auth.
- `id` (uuid, primary key, references auth.users) - the account id
- `full_name` (text) - display name
- `role` (text) - either 'admin' (Aksell Management) or 'worker' (Team Xtra staff)
- `created_at` (timestamptz) - when the account was created

The FIRST person who ever signs up automatically becomes Admin. Everyone who
signs up after that becomes a Worker. Role can never be set by the client -
it is assigned by a trigger when the account is created.

### `shifts`
A work shift Admin publishes for staff to apply to.
- `id` (uuid, primary key)
- `title` (text) - short name, e.g. "Pakking av kampanje"
- `description` (text) - optional details
- `shift_date` (date)
- `start_time` / `end_time` (time) - used to compute scheduled hours
- `required_workers` (integer) - how many people are needed
- `status` (text) - 'open' while accepting applicants, 'fullsatt' once enough
  workers are approved
- `created_by` (uuid) - the admin who created it
- `created_at` (timestamptz)

### `shift_applications`
A worker's application to a shift.
- `id` (uuid, primary key)
- `shift_id` (uuid, references shifts)
- `worker_id` (uuid, references profiles)
- `status` (text) - 'pending', 'approved', 'waitlist' or 'rejected'
- `verified_hours` (numeric) - actual hours confirmed by Admin after the shift
- `verified` (boolean) - true once Admin has confirmed the hours
- `verified_at` (timestamptz)
- `applied_at` (timestamptz)
- unique per (shift, worker) so a worker can only apply once per shift

## 2. Security
- Row Level Security is enabled on every table.
- Both roles can read all shifts (needed to browse open shifts / manage them).
- Only Admin can create, edit or delete shifts.
- A worker can only see and manage their own applications; Admin can see and
  manage all applications.
- The `role` column on `profiles` and the approval/verification columns on
  `shift_applications` are never client-writable - they can only change
  through server-side functions that check the caller is an Admin, so a
  worker can never grant themselves Admin access or approve/verify their own
  shift.
- Approving an applicant and confirming worked hours happen through
  dedicated functions (`approve_application`, `remove_application`,
  `verify_application_hours`) so the "fill up a shift / move the rest to the
  waitlist" logic always runs as one atomic, Admin-only operation.
*/

-- ============================================================
-- 1. profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'worker' CHECK (role IN ('admin', 'worker')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an admin? SECURITY DEFINER so it can read
-- profiles without recursing through this table's own RLS policies.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- Auto-create a profile when someone signs up. First user ever = admin.
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

  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN admin_exists THEN 'worker' ELSE 'admin' END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
CREATE POLICY "profiles_select_own_or_admin" ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON profiles;
CREATE POLICY "profiles_update_own_or_admin" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR is_admin())
  WITH CHECK (auth.uid() = id OR is_admin());

-- Workers may only ever edit their own display name; role changes require
-- the privileged path below (none exposed yet, kept locked down by default).
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (full_name) ON profiles TO authenticated;

-- ============================================================
-- 2. shifts
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  required_workers integer NOT NULL CHECK (required_workers > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fullsatt')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts (shift_date);

DROP POLICY IF EXISTS "shifts_select_all" ON shifts;
CREATE POLICY "shifts_select_all" ON shifts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "shifts_insert_admin" ON shifts;
CREATE POLICY "shifts_insert_admin" ON shifts FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "shifts_update_admin" ON shifts;
CREATE POLICY "shifts_update_admin" ON shifts FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "shifts_delete_admin" ON shifts;
CREATE POLICY "shifts_delete_admin" ON shifts FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================================
-- 3. shift_applications
-- ============================================================

CREATE TABLE IF NOT EXISTS shift_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'waitlist', 'rejected')),
  verified_hours numeric(5,2),
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shift_id, worker_id)
);

ALTER TABLE shift_applications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_applications_shift ON shift_applications (shift_id);
CREATE INDEX IF NOT EXISTS idx_applications_worker ON shift_applications (worker_id);

DROP POLICY IF EXISTS "applications_select_own_or_admin" ON shift_applications;
CREATE POLICY "applications_select_own_or_admin" ON shift_applications FOR SELECT
  TO authenticated
  USING (worker_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "applications_insert_own" ON shift_applications;
CREATE POLICY "applications_insert_own" ON shift_applications FOR INSERT
  TO authenticated
  WITH CHECK (
    worker_id = auth.uid()
    AND EXISTS (SELECT 1 FROM shifts s WHERE s.id = shift_id AND s.status = 'open')
  );

-- Workers may only ever create the link to a shift; every other column
-- (status, verified hours, ...) is filled by defaults or admin-only functions.
REVOKE INSERT ON shift_applications FROM authenticated;
GRANT INSERT (shift_id) ON shift_applications TO authenticated;

DROP POLICY IF EXISTS "applications_update_admin" ON shift_applications;
CREATE POLICY "applications_update_admin" ON shift_applications FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "applications_delete_own_or_admin" ON shift_applications;
CREATE POLICY "applications_delete_own_or_admin" ON shift_applications FOR DELETE
  TO authenticated
  USING ((worker_id = auth.uid() AND status IN ('pending', 'waitlist')) OR is_admin());

-- ============================================================
-- 4. Admin-only privileged functions
-- ============================================================

-- Approve an applicant. If the shift is already at capacity, the applicant
-- is put on the waitlist instead. If this approval fills the shift, every
-- other still-pending applicant is moved to the waitlist and the shift is
-- marked "fullsatt". Runs as one atomic operation to avoid race conditions.
CREATE OR REPLACE FUNCTION approve_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift_id uuid;
  v_required integer;
  v_approved_count integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT shift_id INTO v_shift_id FROM shift_applications WHERE id = p_application_id;
  IF v_shift_id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  SELECT required_workers INTO v_required FROM shifts WHERE id = v_shift_id;

  SELECT count(*) INTO v_approved_count
    FROM shift_applications WHERE shift_id = v_shift_id AND status = 'approved';

  IF v_approved_count >= v_required THEN
    UPDATE shift_applications SET status = 'waitlist' WHERE id = p_application_id;
    RETURN;
  END IF;

  UPDATE shift_applications SET status = 'approved' WHERE id = p_application_id;

  SELECT count(*) INTO v_approved_count
    FROM shift_applications WHERE shift_id = v_shift_id AND status = 'approved';

  IF v_approved_count >= v_required THEN
    UPDATE shifts SET status = 'fullsatt' WHERE id = v_shift_id;
    UPDATE shift_applications SET status = 'waitlist'
      WHERE shift_id = v_shift_id AND status = 'pending';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION approve_application(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_application(uuid) TO authenticated;

-- Reject / remove an applicant (pending, waitlisted or previously approved).
-- If removing an approved worker drops the shift below capacity, the shift
-- is reopened so Admin can approve someone else.
CREATE OR REPLACE FUNCTION remove_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift_id uuid;
  v_required integer;
  v_approved_count integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT shift_id INTO v_shift_id FROM shift_applications WHERE id = p_application_id;
  IF v_shift_id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  UPDATE shift_applications SET status = 'rejected' WHERE id = p_application_id;

  SELECT required_workers INTO v_required FROM shifts WHERE id = v_shift_id;
  SELECT count(*) INTO v_approved_count
    FROM shift_applications WHERE shift_id = v_shift_id AND status = 'approved';

  IF v_approved_count < v_required THEN
    UPDATE shifts SET status = 'open' WHERE id = v_shift_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION remove_application(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION remove_application(uuid) TO authenticated;

-- Confirm or edit the actual hours worked for an approved applicant.
CREATE OR REPLACE FUNCTION verify_application_hours(p_application_id uuid, p_hours numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_hours IS NULL OR p_hours < 0 OR p_hours > 24 THEN
    RAISE EXCEPTION 'Invalid hours';
  END IF;

  UPDATE shift_applications
  SET verified_hours = p_hours, verified = true, verified_at = now()
  WHERE id = p_application_id AND status = 'approved';
END;
$$;

REVOKE EXECUTE ON FUNCTION verify_application_hours(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_application_hours(uuid, numeric) TO authenticated;
