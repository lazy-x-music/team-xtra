/*
# Add cancel_shift function for reverting approved shifts

## Purpose
Allows an admin to cancel an approved worker's shift, reverting their
status from "approved" to "rejected" and sending them a notification
that their shift has been cancelled. This is used from the admin calendar
view when clicking on a green (confirmed) date and removing an approved
worker.

## New Functions
- `cancel_shift(p_application_id uuid)`: Reverts an approved shift
  application to rejected status, sends a "shift_removed" notification,
  and reopens the shift if it was fullsatt.

## Security
- SECURITY DEFINER, search_path set to public
- Admin-only (checks is_admin())
- Execute granted to authenticated only
*/

CREATE OR REPLACE FUNCTION cancel_shift(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift_id uuid;
  v_worker_id uuid;
  v_old_status text;
  v_title text;
  v_shift_date date;
  v_required integer;
  v_approved_count integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT shift_id, worker_id, status
  INTO v_shift_id, v_worker_id, v_old_status
  FROM shift_applications WHERE id = p_application_id;

  IF v_shift_id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  -- Only allow cancelling approved shifts
  IF v_old_status != 'approved' THEN
    RAISE EXCEPTION 'Can only cancel approved shifts';
  END IF;

  -- Revert the application to rejected
  UPDATE shift_applications
    SET status = 'rejected',
        verified = false,
        verified_hours = null,
        verified_at = null
    WHERE id = p_application_id;

  -- Get shift details for notification
  SELECT title, shift_date, required_workers
  INTO v_title, v_shift_date, v_required
  FROM shifts WHERE id = v_shift_id;

  -- Send notification to worker
  INSERT INTO notifications (worker_id, type, title, message, shift_id)
  VALUES (
    v_worker_id,
    'shift_removed',
    'Din vakt er avlyst',
    'Din vakt ' || v_shift_date || ' er avlyst av admin.',
    v_shift_id
  );

  -- Reopen the shift if it was fullsatt
  SELECT count(*) INTO v_approved_count
  FROM shift_applications WHERE shift_id = v_shift_id AND status = 'approved';

  IF v_approved_count < v_required THEN
    UPDATE shifts SET status = 'open' WHERE id = v_shift_id AND status = 'fullsatt';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_shift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_shift(uuid) TO authenticated;
