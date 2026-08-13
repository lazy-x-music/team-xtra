/*
# Add shift types, general-shift setup, and notifications

## Overview
Restructures shifts into two types — "general" (availability-based)
and "campaign" (project-based group shifts) — and adds an in-app
notification system so workers are alerted when assigned to a shift.

## 1. Modified table: `shifts`
- New column `shift_type` (text, default 'campaign') — either 'general'
  (availability-based, admin assigns directly from the availability
  pool) or 'campaign' (project-based, workers apply and admin approves).
  Existing rows default to 'campaign' so the current apply/approve flow
  keeps working unchanged.

## 2. New table: `notifications`
- `id` (uuid, primary key)
- `worker_id` (uuid, references profiles) — who the notification is for
- `type` (text) — 'shift_assigned' | 'campaign_approved' | 'campaign_rejected' | 'shift_removed' | 'hours_updated'
- `title` (text) — short headline
- `message` (text) — body text
- `shift_id` (uuid, nullable, references shifts) — related shift
- `read` (boolean, default false)
- `created_at` (timestamptz, default now())

RLS: workers can read/update their own notifications; admin can read all.
Inserts happen only through SECURITY DEFINER functions (notifications
are system-generated, not worker-created).

## 3. New function: `setup_general_shift`
Admin picks a worker from the availability pool for a date and creates
a general shift + approved application in one atomic operation. Takes
worker_id, shift_date, start_time, end_time. Auto-verifies hours. Sends
a 'shift_assigned' notification to the worker.

## 4. Modified functions
- `approve_application`: now sends a 'campaign_approved' notification.
- `remove_application`: now sends a 'shift_removed' notification (or
  'campaign_rejected' if the worker was pending/waitlisted).
- `verify_application_hours`: now sends a 'hours_updated' notification.
- `assign_worker_to_shift`: now sends a 'shift_assigned' notification.

## 5. New function: `mark_notifications_read`
Marks all of the calling worker's notifications as read.

## Security
- RLS enabled on `notifications`.
- Workers can only read/update their own notifications.
- All notification inserts are through SECURITY DEFINER functions.
- New `setup_general_shift` is admin-only, SECURITY DEFINER.
*/

-- ============================================================
-- 1. Add shift_type to shifts
-- ============================================================

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_type text NOT NULL DEFAULT 'campaign'
  CHECK (shift_type IN ('general', 'campaign'));

-- ============================================================
-- 2. notifications table
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('shift_assigned', 'campaign_approved', 'campaign_rejected', 'shift_removed', 'hours_updated')),
  title text NOT NULL,
  message text NOT NULL,
  shift_id uuid REFERENCES shifts(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notifications_worker ON notifications (worker_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (worker_id, read);

DROP POLICY IF EXISTS "notifications_select_own_or_admin" ON notifications;
CREATE POLICY "notifications_select_own_or_admin" ON notifications FOR SELECT
  TO authenticated
  USING (worker_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE
  TO authenticated
  USING (worker_id = auth.uid())
  WITH CHECK (worker_id = auth.uid());

-- ============================================================
-- 3. setup_general_shift
-- ============================================================

CREATE OR REPLACE FUNCTION setup_general_shift(
  p_worker_id uuid,
  p_shift_date date,
  p_start_time time,
  p_end_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift_id uuid;
  v_hours numeric;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_hours := (EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 3600)::numeric;

  INSERT INTO shifts (title, shift_date, start_time, end_time, required_workers, status, shift_type)
    VALUES ('Generell vakt', p_shift_date, p_start_time, p_end_time, 1, 'fullsatt', 'general')
    RETURNING id INTO v_shift_id;

  INSERT INTO shift_applications (shift_id, worker_id, status, verified_hours, verified, verified_at)
    VALUES (v_shift_id, p_worker_id, 'approved', v_hours, true, now());

  INSERT INTO notifications (worker_id, type, title, message, shift_id)
    VALUES (
      p_worker_id,
      'shift_assigned',
      'Du har blitt satt opp på vakt!',
      'Du har fått en bekreftet vakt ' || p_shift_date || ' kl. ' || p_start_time || '–' || p_end_time || '.',
      v_shift_id
    );

  RETURN v_shift_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION setup_general_shift(uuid, date, time, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION setup_general_shift(uuid, date, time, time) TO authenticated;

-- ============================================================
-- 4. Update approve_application with notification
-- ============================================================

CREATE OR REPLACE FUNCTION approve_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift_id uuid;
  v_worker_id uuid;
  v_required integer;
  v_approved_count integer;
  v_start time;
  v_end time;
  v_hours numeric;
  v_shift_date date;
  v_title text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT shift_id, worker_id INTO v_shift_id, v_worker_id FROM shift_applications WHERE id = p_application_id;
  IF v_shift_id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  SELECT required_workers, start_time, end_time, shift_date, title
    INTO v_required, v_start, v_end, v_shift_date, v_title
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

  INSERT INTO notifications (worker_id, type, title, message, shift_id)
    VALUES (
      v_worker_id,
      'campaign_approved',
      'Du er godkjent for kampanje!',
      'Du er godkjent for "' || v_title || '" ' || v_shift_date || '. Timene er registrert.',
      v_shift_id
    );

  SELECT count(*) INTO v_approved_count
    FROM shift_applications WHERE shift_id = v_shift_id AND status = 'approved';

  IF v_approved_count >= v_required THEN
    UPDATE shifts SET status = 'fullsatt' WHERE id = v_shift_id;
    UPDATE shift_applications SET status = 'waitlist'
      WHERE shift_id = v_shift_id AND status = 'pending';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION approve_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_application(uuid) TO authenticated;

-- ============================================================
-- 5. Update remove_application with notification
-- ============================================================

CREATE OR REPLACE FUNCTION remove_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift_id uuid;
  v_worker_id uuid;
  v_required integer;
  v_approved_count integer;
  v_old_status text;
  v_title text;
  v_shift_date date;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT shift_id, worker_id, status INTO v_shift_id, v_worker_id, v_old_status
    FROM shift_applications WHERE id = p_application_id;
  IF v_shift_id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  UPDATE shift_applications SET status = 'rejected' WHERE id = p_application_id;

  SELECT title, shift_date INTO v_title, v_shift_date FROM shifts WHERE id = v_shift_id;

  IF v_old_status = 'approved' THEN
    INSERT INTO notifications (worker_id, type, title, message, shift_id)
      VALUES (
        v_worker_id,
        'shift_removed',
        'Du er fjernet fra vakt',
        'Du er fjernet fra "' || v_title || '" ' || v_shift_date || '.',
        v_shift_id
      );
  ELSE
    INSERT INTO notifications (worker_id, type, title, message, shift_id)
      VALUES (
        v_worker_id,
        'campaign_rejected',
        'Søknad avslått',
        'Søknaden din på "' || v_title || '" ' || v_shift_date || ' er avslått.',
        v_shift_id
      );
  END IF;

  SELECT required_workers INTO v_required FROM shifts WHERE id = v_shift_id;
  SELECT count(*) INTO v_approved_count
    FROM shift_applications WHERE shift_id = v_shift_id AND status = 'approved';

  IF v_approved_count < v_required THEN
    UPDATE shifts SET status = 'open' WHERE id = v_shift_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION remove_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION remove_application(uuid) TO authenticated;

-- ============================================================
-- 6. Update verify_application_hours with notification
-- ============================================================

CREATE OR REPLACE FUNCTION verify_application_hours(p_application_id uuid, p_hours numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id uuid;
  v_title text;
  v_shift_date date;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_hours IS NULL OR p_hours < 0 OR p_hours > 24 THEN
    RAISE EXCEPTION 'Invalid hours';
  END IF;

  SELECT worker_id INTO v_worker_id FROM shift_applications WHERE id = p_application_id;

  UPDATE shift_applications
  SET verified_hours = p_hours, verified = true, verified_at = now()
  WHERE id = p_application_id AND status = 'approved';

  SELECT title, shift_date INTO v_title, v_shift_date
    FROM shifts s JOIN shift_applications sa ON sa.shift_id = s.id
    WHERE sa.id = p_application_id;

  INSERT INTO notifications (worker_id, type, title, message, shift_id)
    VALUES (
      v_worker_id,
      'hours_updated',
      'Timer oppdatert',
      'Timene dine for "' || v_title || '" ' || v_shift_date || ' er oppdatert til ' || p_hours || ' timer.',
      (SELECT shift_id FROM shift_applications WHERE id = p_application_id)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION verify_application_hours(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION verify_application_hours(uuid, numeric) TO authenticated;

-- ============================================================
-- 7. Update assign_worker_to_shift with notification
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
  v_title text;
  v_shift_date date;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT required_workers, start_time, end_time, title, shift_date
    INTO v_required, v_start, v_end, v_title, v_shift_date
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

  INSERT INTO notifications (worker_id, type, title, message, shift_id)
    VALUES (
      p_worker_id,
      'shift_assigned',
      'Du har blitt satt opp på vakt!',
      'Du har fått en bekreftet vakt for "' || v_title || '" ' || v_shift_date || '.',
      p_shift_id
    );

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
-- 8. mark_notifications_read
-- ============================================================

CREATE OR REPLACE FUNCTION mark_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notifications SET read = true
    WHERE worker_id = auth.uid() AND read = false;
END;
$$;

REVOKE EXECUTE ON FUNCTION mark_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_notifications_read() TO authenticated;
