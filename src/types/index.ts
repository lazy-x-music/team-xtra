export type Role = 'admin' | 'worker';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  employee_number: number | null;
  setup_complete: boolean;
  created_at: string;
}

export type ShiftStatus = 'open' | 'fullsatt';
export type ShiftType = 'general' | 'campaign';

export interface Shift {
  id: string;
  title: string;
  description: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  required_workers: number;
  status: ShiftStatus;
  shift_type: ShiftType;
  created_by: string;
  created_at: string;
}

export type ApplicationStatus = 'pending' | 'approved' | 'waitlist' | 'rejected';

export interface ShiftApplication {
  id: string;
  shift_id: string;
  worker_id: string;
  status: ApplicationStatus;
  verified_hours: number | null;
  verified: boolean;
  verified_at: string | null;
  applied_at: string;
}

export interface ApplicationWithWorker extends ShiftApplication {
  worker: { employee_number: number | null } | null;
}

export interface ApplicationWithShift extends ShiftApplication {
  shift: Shift;
}

export interface ApplicationWithShiftAndWorker extends ShiftApplication {
  shift: Shift;
  worker: { employee_number: number | null } | null;
}

export interface WorkerAvailability {
  id: string;
  worker_id: string;
  available_date: string;
  created_at: string;
}

export interface AvailabilityWithWorker extends WorkerAvailability {
  worker: { employee_number: number | null } | null;
}

export type NotificationType =
  | 'shift_assigned'
  | 'campaign_approved'
  | 'campaign_rejected'
  | 'shift_removed'
  | 'hours_updated';

export interface AppNotification {
  id: string;
  worker_id: string;
  type: NotificationType;
  title: string;
  message: string;
  shift_id: string | null;
  read: boolean;
  created_at: string;
}
