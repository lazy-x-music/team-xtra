import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getHolidayName, isHoliday, isWeekend, isSelectableDate, localDateStr, todayStr } from '@/utils/holidays';

const WEEKDAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const MONTH_NAMES = [
  'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
];

export interface CalendarDay {
  dateStr: string;
  day: number;
  inMonth: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  selectable: boolean;
  isToday: boolean;
}

export interface CalendarProps {
  year: number;
  month: number; // 0-indexed
  selectedDates?: Set<string>;
  confirmedDates?: Set<string>;
  availabilityMap?: Map<string, number>; // dateStr -> count of available workers
  onDateClick?: (dateStr: string, day: CalendarDay) => void;
  selectableFilter?: (dateStr: string) => boolean;
  showAvailabilityCounts?: boolean;
  renderDayBadge?: (dateStr: string) => React.ReactNode;
}

export function Calendar({
  year,
  month,
  selectedDates,
  confirmedDates,
  availabilityMap,
  onDateClick,
  selectableFilter,
  showAvailabilityCounts,
  renderDayBadge,
}: CalendarProps) {
  const days = useMemo(() => buildCalendarDays(year, month), [year, month]);
  const today = todayStr();

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-center text-xs font-semibold text-gray-400 py-1">
            {wd}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const isSelected = selectedDates?.has(day.dateStr);
          const isConfirmed = confirmedDates?.has(day.dateStr);
          const isAvailable = availabilityMap?.get(day.dateStr) ?? 0;
          const passesFilter = selectableFilter ? selectableFilter(day.dateStr) : true;
          const canClick = day.inMonth && day.selectable && passesFilter;
          const hasBadge = renderDayBadge && day.inMonth;

          return (
            <button
              key={i}
              disabled={!canClick}
              onClick={() => onDateClick?.(day.dateStr, day)}
              className={`
                relative aspect-square rounded-lg flex flex-col items-center justify-center
                text-sm transition-all
                ${!day.inMonth ? 'opacity-30 pointer-events-none' : ''}
                ${day.isWeekend || day.isHoliday ? 'bg-gray-50 text-gray-300' : ''}
                ${day.isToday && !isSelected && !isConfirmed ? 'ring-1 ring-primary-300' : ''}
                ${isConfirmed
                  ? 'bg-success-500 text-white font-bold shadow-sm'
                  : isSelected
                    ? 'bg-primary-800 text-white font-bold shadow-sm'
                    : canClick
                      ? 'hover:bg-primary-50 hover:text-primary-800 cursor-pointer text-gray-700'
                      : day.inMonth && !day.selectable
                        ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                        : ''}
              `}
            >
              <span className={isSelected || isConfirmed ? 'text-white' : ''}>{day.day}</span>
              {day.isHoliday && day.inMonth && !isSelected && !isConfirmed && (
                <span className="text-[8px] text-gray-400 mt-0.5 leading-none">Hellig</span>
              )}
              {isConfirmed && (
                <span className="text-[7px] font-semibold mt-0.5 leading-none">Vakt</span>
              )}
              {showAvailabilityCounts && isAvailable > 0 && !isSelected && !isConfirmed && (
                <span className="absolute bottom-0.5 right-0.5 text-[9px] font-bold bg-accent-500 text-white rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {isAvailable}
                </span>
              )}
              {hasBadge && (
                <span className="absolute top-0.5 right-0.5">{renderDayBadge!(day.dateStr)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarNav({
  year,
  month,
  onPrev,
  onNext,
}: {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-bold text-primary-950">
        {MONTH_NAMES[month]} {year}
      </h3>
      <div className="flex gap-1">
        <button onClick={onPrev} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={onNext} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function buildCalendarDays(year: number, month: number): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Monday = 0
  const today = todayStr();

  const days: CalendarDay[] = [];

  // Previous month padding
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    const dateStr = localDateStr(d);
    days.push(makeDay(dateStr, d.getDate(), false, today));
  }

  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const dateStr = localDateStr(date);
    days.push(makeDay(dateStr, d, true, today));
  }

  // Next month padding to fill 6 rows (42 cells)
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    const date = new Date(year, month + 1, d);
    const dateStr = localDateStr(date);
    days.push(makeDay(dateStr, d, false, today));
  }

  return days;
}

function makeDay(dateStr: string, day: number, inMonth: boolean, today: string): CalendarDay {
  const weekend = isWeekend(dateStr);
  const holiday = isHoliday(dateStr);
  return {
    dateStr,
    day,
    inMonth,
    isWeekend: weekend,
    isHoliday: holiday,
    holidayName: getHolidayName(dateStr),
    selectable: isSelectableDate(dateStr),
    isToday: dateStr === today,
  };
}

export { MONTH_NAMES };
