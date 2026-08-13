// Norwegian national holidays (helligdager) and typical days off.
// Fixed-date holidays + movable feasts computed from Easter Sunday.

function easterSunday(year: number): Date {
  // Meeus/Jones/Butcher algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function shiftDate(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();
  const easter = easterSunday(year);

  // Fixed-date holidays
  holidays.set(`${year}-01-01`, 'Første nyttårsdag');
  holidays.set(`${year}-05-01`, 'Arbeidernes dag');
  holidays.set(`${year}-05-17`, 'Grunnlovsdagen');
  holidays.set(`${year}-12-25`, 'Første juledag');
  holidays.set(`${year}-12-26`, 'Andre juledag');

  // Movable feasts (relative to Easter Sunday)
  holidays.set(fmt(shiftDate(easter, -3)), 'Skjærtorsdag');
  holidays.set(fmt(shiftDate(easter, -2)), 'Langfredag');
  holidays.set(fmt(easter), 'Første påskedag');
  holidays.set(fmt(shiftDate(easter, 1)), 'Andre påskedag');
  holidays.set(fmt(shiftDate(easter, 39)), 'Kristi himmelfartsdag');
  holidays.set(fmt(shiftDate(easter, 49)), 'Første pinsedag');
  holidays.set(fmt(shiftDate(easter, 50)), 'Andre pinsedag');

  return holidays;
}

const holidayCache = new Map<number, Map<string, string>>();

export function getHolidayMap(year: number): Map<string, string> {
  if (!holidayCache.has(year)) holidayCache.set(year, getHolidays(year));
  return holidayCache.get(year)!;
}

export function isHoliday(dateStr: string): boolean {
  const year = Number(dateStr.slice(0, 4));
  return getHolidayMap(year).has(dateStr);
}

export function getHolidayName(dateStr: string): string | null {
  const year = Number(dateStr.slice(0, 4));
  return getHolidayMap(year).get(dateStr) ?? null;
}

export function isWeekend(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

export function isSelectableDate(dateStr: string): boolean {
  return !isWeekend(dateStr) && !isHoliday(dateStr);
}
