import { Shift } from '@/types';

export function computeHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  return Math.round((minutes / 60) * 100) / 100;
}

export function shiftEndDateTime(shift: Pick<Shift, 'shift_date' | 'end_time'>): Date {
  return new Date(`${shift.shift_date}T${shift.end_time}`);
}

export function isShiftPast(shift: Pick<Shift, 'shift_date' | 'end_time'>): boolean {
  return shiftEndDateTime(shift).getTime() < Date.now();
}

export function formatHours(hours: number): string {
  return `${hours.toLocaleString('nb-NO', { maximumFractionDigits: 2 })} t`;
}

export function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('nb-NO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'short',
  });
}

export function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)}–${endTime.slice(0, 5)}`;
}

export function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('nb-NO', {
    month: 'long',
    year: 'numeric',
  });
}
