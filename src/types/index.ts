export type Role = 'admin' | 'worker';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  created_at: string;
}

export type ShiftStatus = 'open' | 'fullsatt';

export interface Shift {
  id: string;
  title: string;
  description: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  required_workers: number;
  status: ShiftStatus;
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
  worker: { full_name: string } | null;
}

export interface ApplicationWithShift extends ShiftApplication {
  shift: Shift;
}

export interface ApplicationWithShiftAndWorker extends ShiftApplication {
  shift: Shift;
  worker: { full_name: string } | null;
}
