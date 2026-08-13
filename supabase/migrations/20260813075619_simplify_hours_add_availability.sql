/*
# Simplify hour tracking + add worker availability

## Overview
Three structural changes:
1. When Admin approves a worker for a shift, the scheduled hours are now
   automatically written as verified_hours / verified=true — the separate
   post-shift "Til Godkjenning" step is removed. Admin can still edit hours
   on an approved assignment.
2. Adds a `worker_availability` table so Team Xtra workers can mark which
   dates they are available to work.
3. Adds two admin functions: `assign_worker_to_shift` (create an approved
   application directly from the availability pool) and
   `invite_available_workers` (send a shift request to all available workers
   for a date by creating pending applications for each of them).

## 1. Modified functions

### `approve_application`
Now also sets `verified_hours` to the shift's scheduled hours and
`verified = true`, `verified_at = now()` at approval time. This makes
approved hours flow straight into reports without a separate verification
step.

### `verify_application_hours` → renamed conceptually to `edit_application_hours`
The existing `verify_application_hours` function is kept (so existing callers
don't break) but now simply updates the hours/verified flag on any approved
application — used by Admin's "Edit hours" action. Behaviour is unchanged
except it no longer requires the shift to be in any particular state.

## 2. New table: `worker_availability`
- `id` (uuid, primary key)
- `worker_id` (uuid, references profiles, default auth.uid())
- `available_date` (date) — the date the worker is available
- `created_at` (timestamptz)
- UNIQUE (worker_id, available_date) so a worker can only mark a date once.

RLS: workers can CRUD their own availability rows; admins can read all
availability rows (for the overview matrix) but cannot create/update/delete
them (availability is worker-controlled).

## 3. New admin functions

### `assign_worker_to_shift(p_shift_id, p_worker_id)`
Creates an approved application for a specific worker on a shift. If the
shift is full, the worker goes to the waitlist instead. Auto-verifies hours
just like approve_application. Admin-only.

### `invite_available_workers(p_shift_id)`
Creates pending applications for every worker who has marked themselves
available on the shift's date (and who hasn't already applied). Admin-only.
Returns the count of invitations sent.

## Security
- RLS enabled on `worker_availability`.
- Workers can only manage their own availability.
- Admins can read all availability rows but not modify them.
- New functions are SECURITY DEFINER, admin-only, with execute granted to
  authenticated only.
*/

-- ============================================================
-- 1. Modify approve_application to auto-verify hours
-- ============================================================

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
  v_start time;
  v_end time;
  v_hours numeric;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT shift_id INTO v_shift_id FROM shift_applications WHERE id = p_application_id;
  IF v_shift_id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  SELECT required_workers, start_time, end_time INTO v_required, v_start, v_end
    FROM shifts WHERE id = v_shift_id;

  v_hours := (EXTRACT(EPOCH FROM (v_end - v_start)) / 3600)::numeric;

  SELECT count(*) INTO v_approved_count
    FROM shift_applications WHERE shift_id = v_shift_id AND status = 'approved';

  IF v_approved_count >= v_required THEN
    UPDATE shift_applications SET status = 'waitlist' WHERE id = p_application_id;
    RETURN;
  END IF;

  UPDATE shift_applications
    SET status = 'approved',
        verified_hours = v_hours,
        verified = true,
        verified_at = now()
    WHERE id = p_application_id;

  SELECT count(*) INTO v_approved_count
    FROM shift_applications WHERE shift_id = v_shift_id AND status = 'approved';

  IF v_approved_count >= v_required THEN
    UPDATE shifts SET status = 'fullsatt' WHERE id = v_shift_id;
    UPDATE shift_applications SET status = 'waitlist'
      WHERE shift_id = v_shift_id AND status = 'pending';
  END IF;
END;
$$;

-- ============================================================
-- 2. worker_availability table
-- ============================================================

CREATE TABLE IF NOT EXISTS worker_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  available_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, available_date)
);

ALTER TABLE worker_availability ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_availability_date ON worker_availability (available_date);
CREATE INDEX IF NOT EXISTS idx_availability_worker ON worker_availability (worker_id);

DROP POLICY IF EXISTS "availability_select_own_or_admin" ON worker_availability;
CREATE POLICY "availability_select_own_or_admin" ON worker_availability FOR SELECT
  TO authenticated
  USING (worker_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "availability_insert_own" ON worker_availability;
CREATE POLICY "availability_insert_own" ON worker_availability FOR INSERT
  TO authenticated
  WITH CHECK (worker_id = auth.uid());

DROP POLICY IF EXISTS "availability_delete_own" ON worker_availability;
CREATE POLICY "availability_delete_own" ON worker_availability FOR DELETE
  TO authenticated
  USING (worker_id = auth.uid());

-- ============================================================
-- 3. assign_worker_to_shift (admin creates approved assignment directly)
-- ============================================================

CREATE OR REPLACE FUNCTION assign_worker_to_shift(p_shift_id uuid, p_worker_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required integer;
  v_approved_count integer;
  v_start time;
  v_end time;
  v_hours numeric;
  v_existing uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT required_workers, start_time, end_time INTO v_required, v_start, v_end
    FROM shifts WHERE id = p_shift_id;
  IF v_required IS NULL THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  v_hours := (EXTRACT(EPOCH FROM (v_end - v_start)) / 3600)::numeric;

  SELECT id INTO v_existing FROM shift_applications
    WHERE shift_id = p_shift_id AND worker_id = p_worker_id;

  SELECT count(*) INTO v_approved_count
    FROM shift_applications WHERE shift_id = p_shift_id AND status = 'approved';

  IF v_approved_count >= v_required THEN
    IF v_existing IS NOT NULL THEN
      UPDATE shift_applications SET status = 'waitlist' WHERE id = v_existing;
    ELSE
      INSERT INTO shift_applications (shift_id, worker_id, status)
        VALUES (p_shift_id, p_worker_id, 'waitlist');
    END IF;
    RETURN;
  END IF;

  IF v_existing IS NOT NULL THEN
    UPDATE shift_applications
      SET status = 'approved',
          verified_hours = v_hours,
          verified = true,
          verified_at = now()
      WHERE id = v_existing;
  ELSE
    INSERT INTO shift_applications (shift_id, worker_id, status, verified_hours, verified, verified_at)
      VALUES (p_shift_id, p_worker_id, 'approved', v_hours, true, now());
  END IF;

  SELECT count(*) INTO v_approved_count
    FROM shift_applications WHERE shift_id = p_shift_id AND status = 'approved';

  IF v_approved_count >= v_required THEN
    UPDATE shifts SET status = 'fullsatt' WHERE id = p_shift_id;
    UPDATE shift_applications SET status = 'waitlist'
      WHERE shift_id = p_shift_id AND status = 'pending';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION assign_worker_to_shift(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION assign_worker_to_shift(uuid, uuid) TO authenticated;

-- ============================================================
-- 4. invite_available_workers (admin sends request to all available)
-- ============================================================

CREATE OR REPLACE FUNCTION invite_available_workers(p_shift_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift_date date;
  v_count integer := 0;
  v_worker record;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT shift_date INTO v_shift_date FROM shifts WHERE id = p_shift_id;
  IF v_shift_date IS NULL THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  FOR v_worker IN
    SELECT wa.worker_id
      FROM worker_availability wa
      WHERE wa.available_date = v_shift_date
        AND NOT EXISTS (
          SELECT 1 FROM shift_applications sa
          WHERE sa.shift_id = p_shift_id AND sa.worker_id = wa.worker_id
        )
  LOOP
    INSERT INTO shift_applications (shift_id, worker_id, status)
      VALUES (p_shift_id, v_worker.worker_id, 'pending')
      ON CONFLICT (shift_id, worker_id) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION invite_available_workers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION invite_available_workers(uuid) TO authenticated;

-- ============================================================
-- 5. Allow workers to insert applications with status default
--    (needed for invite + assign functions that insert as admin)
--    Already handled via SECURITY DEFINER; just ensure the
--    verify_application_hours function still works for "Edit hours"
-- ============================================================

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

REVOKE EXECUTE ON FUNCTION verify_application_hours(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION verify_application_hours(uuid, numeric) TO authenticated;
