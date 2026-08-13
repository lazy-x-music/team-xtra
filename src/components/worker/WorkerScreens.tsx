import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ApplicationWithShift, Shift } from '@/types';
import {
  computeHours,
  formatDate,
  formatHours,
  formatShortDate,
  formatTimeRange,
  isShiftPast,
} from '@/utils/shiftHelpers';
import { Calendar, CalendarNav } from '@/components/Calendar';
import { Card, Empty, Metric, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { isHoliday, getHolidayName } from '@/utils/holidays';

const today = new Date().toISOString().slice(0, 10);

export function WorkerAvailability({
  refresh,
  onRefresh,
}: {
  refresh: number;
  onRefresh: () => void;
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [availability, setAvailability] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    load();
  }, [refresh]);

  async function load() {
    const { data } = await supabase.from('worker_availability').select('available_date');
    setAvailability(new Set((data || []).map((r: { available_date: string }) => r.available_date)));
  }

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  }

  async function toggleDate(dateStr: string) {
    const newSet = new Set(availability);
    if (newSet.has(dateStr)) {
      const { error } = await supabase
        .from('worker_availability')
        .delete()
        .eq('available_date', dateStr);
      if (!error) newSet.delete(dateStr);
    } else {
      const { error } = await supabase
        .from('worker_availability')
        .insert({ available_date: dateStr });
      if (error) {
        setNotice({ message: 'Kunne ikke lagre tilgjengeligheten.', error: true });
        return;
      }
      newSet.add(dateStr);
    }
    setAvailability(newSet);
    onRefresh();
  }

  const selectedCount = availability.size;
  const monthHolidays = useMemo(() => {
    const days = new Date(year, month + 1, 0).getDate();
    const holidays: { date: string; name: string }[] = [];
    for (let d = 1; d <= days; d++) {
      const dateStr = new Date(year, month, d).toISOString().slice(0, 10);
      const name = getHolidayName(dateStr);
      if (name) holidays.push({ date: dateStr, name });
    }
    return holidays;
  }, [year, month]);

  return (
    <>
      <PageHeader
        eyebrow="Team Xtra"
        title="Min tilgjengelighet"
        description="Marker dagene du er tilgjengelig for å jobbe. Helger og helligdager er låst. Du kan endre når som helst."
        action={
          <div className="rounded-xl bg-primary-900 text-white px-4 py-3">
            <p className="text-xs text-primary-300">Dager markert</p>
            <p className="text-lg font-bold mt-0.5">{selectedCount}</p>
          </div>
        }
      />

      {notice && <Notice {...notice} onClose={() => setNotice(null)} />}

      <Card className="p-5 sm:p-6">
        <CalendarNav year={year} month={month} onPrev={prevMonth} onNext={nextMonth} />
        <Calendar
          year={year}
          month={month}
          selectedDates={availability}
          onDateClick={(dateStr) => toggleDate(dateStr)}
          selectableFilter={() => true}
        />
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-primary-800" /> Markert som tilgjengelig
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-gray-50 border border-gray-200" /> Helg / helligdag (låst)
          </span>
        </div>
      </Card>

      {monthHolidays.length > 0 && (
        <Card className="p-5 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Helligdager denne måneden</h3>
          </div>
          <div className="space-y-1.5">
            {monthHolidays.map((h) => (
              <div key={h.date} className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{formatShortDate(h.date)}</span>
                <span className="font-medium text-gray-700">{h.name}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

export function WorkerShifts({
  refresh,
  onRefresh,
}: {
  refresh: number;
  onRefresh: () => void;
}) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [apps, setApps] = useState<ApplicationWithShift[]>([]);
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    load();
  }, [refresh]);

  async function load() {
    const [{ data: shiftsData }, { data: appsData }] = await Promise.all([
      supabase.from('shifts').select('*').eq('status', 'open').order('shift_date'),
      supabase.from('shift_applications').select('*, shift:shifts(*)'),
    ]);
    setShifts((shiftsData || []) as Shift[]);
    setApps((appsData || []) as ApplicationWithShift[]);
  }

  async function apply(shiftId: string) {
    const { error } = await supabase.from('shift_applications').insert({ shift_id: shiftId });
    if (error) {
      setNotice({ message: 'Du er allerede påmeldt, eller vakten er ikke lenger åpen.', error: true });
    } else {
      setNotice({ message: 'Du er meldt på vakten.' });
      load();
      onRefresh();
    }
  }

  const open = shifts.filter((s) => !isShiftPast(s));

  return (
    <>
      <PageHeader
        eyebrow="Team Xtra"
        title="Finn en vakt"
        description="Se ledige vakter og meld deg på når det passer."
      />

      {notice && <Notice {...notice} onClose={() => setNotice(null)} />}

      {open.length === 0 ? (
        <Card>
          <Empty title="Ingen åpne vakter" text="Det finnes ingen ledige vakter akkurat nå. Sjekk igjen senere." />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {open.map((shift) => {
            const existing = apps.find((a) => a.shift_id === shift.id);
            const hours = computeHours(shift.start_time, shift.end_time);
            return (
              <Card key={shift.id} className="p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-xl bg-accent-50 text-accent-700 flex flex-col items-center justify-center">
                    <span className="font-bold leading-none">
                      {new Date(`${shift.shift_date}T00:00:00`).getDate()}
                    </span>
                    <span className="text-[10px] uppercase font-semibold">
                      {new Date(`${shift.shift_date}T00:00:00`).toLocaleDateString('nb-NO', { month: 'short' })}
                    </span>
                  </div>
                  {existing ? (
                    <StatusBadge status={existing.status} />
                  ) : (
                    <span className="text-xs font-semibold text-success-700">
                      {shift.required_workers} plasser
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-primary-950 mt-5">{shift.title}</h3>
                <p className="text-sm text-gray-500 mt-2">{formatDate(shift.shift_date)}</p>
                <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                  <Clock3 className="w-4 h-4 text-gray-400" />
                  {formatTimeRange(shift.start_time, shift.end_time)} · {hours} t
                </div>
                {shift.description && (
                  <p className="text-sm text-gray-500 mt-4 leading-relaxed">{shift.description}</p>
                )}
                {!existing && (
                  <button onClick={() => apply(shift.id)} className="button-primary w-full mt-5">
                    Meld meg på <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export function MyShifts({ refresh }: { refresh: number }) {
  const [items, setItems] = useState<ApplicationWithShift[]>([]);
  const [verifiedHours, setVerifiedHours] = useState(0);

  useEffect(() => {
    load();
  }, [refresh]);

  async function load() {
    const { data } = await supabase
      .from('shift_applications')
      .select('*, shift:shifts(*)')
      .order('applied_at', { ascending: false });
    const list = (data || []) as ApplicationWithShift[];
    setItems(list);
    const currentMonth = today.slice(0, 7);
    setVerifiedHours(
      list
        .filter((a) => a.verified && a.shift.shift_date.startsWith(currentMonth))
        .reduce((sum, a) => sum + Number(a.verified_hours || 0), 0)
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Team Xtra"
        title="Mine vakter"
        description="Hold oversikt over påmeldte vakter og godkjente timer."
        action={
          <div className="rounded-xl bg-primary-900 text-white px-4 py-3">
            <p className="text-xs text-primary-300">Godkjent denne måneden</p>
            <p className="text-lg font-bold mt-0.5">{formatHours(verifiedHours)}</p>
          </div>
        }
      />

      <Card>
        {items.length === 0 ? (
          <Empty title="Du har ingen vakter ennå" text="Finn en ledig vakt og meld deg på." />
        ) : (
          items.map((item) => (
            <div key={item.id} className="p-5 border-b border-gray-100 last:border-0 flex items-center gap-4">
              <div className="hidden sm:flex w-12 h-12 rounded-xl bg-primary-50 text-primary-800 flex-col items-center justify-center">
                <span className="font-bold leading-none">
                  {new Date(`${item.shift.shift_date}T00:00:00`).getDate()}
                </span>
                <span className="text-[10px] uppercase">
                  {new Date(`${item.shift.shift_date}T00:00:00`).toLocaleDateString('nb-NO', { month: 'short' })}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-primary-950">{item.shift.title}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {formatDate(item.shift.shift_date)} · {formatTimeRange(item.shift.start_time, item.shift.end_time)}
                </p>
              </div>
              <div className="text-right">
                <StatusBadge status={item.verified ? 'completed' : item.status} />
                {item.verified && (
                  <p className="text-xs text-gray-500 mt-1">{formatHours(Number(item.verified_hours || 0))}</p>
                )}
              </div>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
