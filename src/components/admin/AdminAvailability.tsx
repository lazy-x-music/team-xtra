import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Send,
  UserPlus,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  ApplicationWithShiftAndWorker,
  AvailabilityWithWorker,
  Shift,
} from '@/types';
import {
  computeHours,
  formatDate,
  formatHours,
  formatMonthLabel,
  formatShortDate,
  formatTimeRange,
} from '@/utils/shiftHelpers';
import {
  Calendar,
  CalendarNav,
} from '@/components/Calendar';
import {
  Card,
  Drawer,
  Empty,
  Field,
  Metric,
  Modal,
  Notice,
  PageHeader,
  StatusBadge,
} from '@/components/ui';
import { ShiftForm } from '@/components/admin/AdminShifts';

const today = new Date().toISOString().slice(0, 10);

export function AdminAvailability({
  refresh,
  onRefresh,
}: {
  refresh: number;
  onRefresh: () => void;
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [availability, setAvailability] = useState<AvailabilityWithWorker[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    load();
  }, [refresh, year, month]);

  async function load() {
    const start = new Date(year, month, 1).toISOString().slice(0, 10);
    const end = new Date(year, month + 1, 0).toISOString().slice(0, 10);
    const { data } = await supabase
      .from('worker_availability')
      .select('*, worker:profiles!worker_id(full_name)')
      .gte('available_date', start)
      .lte('available_date', end);
    setAvailability((data || []) as AvailabilityWithWorker[]);
  }

  const availabilityMap = useMemo(() => {
    const map = new Map<string, number>();
    availability.forEach((a) => {
      map.set(a.available_date, (map.get(a.available_date) || 0) + 1);
    });
    return map;
  }, [availability]);

  const workersForDate = useMemo(() => {
    if (!selectedDate) return [];
    return availability.filter((a) => a.available_date === selectedDate);
  }, [availability, selectedDate]);

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

  return (
    <>
      <PageHeader
        eyebrow="Administrasjon"
        title="Tilgjengelighet"
        description="Se hvilke medarbeidere som er tilgjengelige per dag, og opprett vakter rett fra kalenderen."
      />

      {notice && <Notice {...notice} onClose={() => setNotice(null)} />}

      <Card className="p-5 sm:p-6">
        <CalendarNav year={year} month={month} onPrev={prevMonth} onNext={nextMonth} />
        <Calendar
          year={year}
          month={month}
          availabilityMap={availabilityMap}
          showAvailabilityCounts
          onDateClick={(dateStr) => setSelectedDate(dateStr)}
          selectableFilter={() => true}
        />
        <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-gray-50 border border-gray-200" /> Helg / helligdag
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-accent-500 text-white text-[8px] flex items-center justify-center font-bold">N</span>
            N tilgjengelige
          </span>
        </div>
      </Card>

      {selectedDate && (
        <Drawer
          title={formatDate(selectedDate)}
          subtitle="Tilgjengelige medarbeidere"
          onClose={() => setSelectedDate(null)}
        >
          <div className="p-6">
            {workersForDate.length === 0 ? (
              <Empty title="Ingen tilgjengelige" text="Ingen medarbeidere har markert seg som tilgjengelige på denne datoen." />
            ) : (
              <>
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setShowShiftForm(true)}
                    className="button-primary flex-1 text-sm"
                  >
                    Opprett vakt denne dagen
                  </button>
                </div>
                <div className="space-y-3">
                  {workersForDate.map((w) => (
                    <div key={w.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl">
                      <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold">
                        {w.worker?.full_name?.charAt(0) || '?'}
                      </div>
                      <p className="text-sm font-semibold flex-1">{w.worker?.full_name || 'Ukjent'}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Drawer>
      )}

      {showShiftForm && selectedDate && (
        <ShiftForm
          initialDate={selectedDate}
          onClose={() => setShowShiftForm(false)}
          onCreated={() => {
            setShowShiftForm(false);
            setSelectedDate(null);
            onRefresh();
            setNotice({ message: 'Vakten er opprettet. Du kan nå tildele medarbeidere fra listen.' });
          }}
        />
      )}
    </>
  );
}

export function AdminReports({ refresh }: { refresh: number }) {
  const [items, setItems] = useState<ApplicationWithShiftAndWorker[]>([]);
  const [month, setMonth] = useState(today.slice(0, 7));

  useEffect(() => {
    supabase
      .from('shift_applications')
      .select('*, shift:shifts(*), worker:profiles!worker_id(full_name)')
      .eq('verified', true)
      .then(({ data }) => setItems((data || []) as ApplicationWithShiftAndWorker[]));
  }, [refresh]);

  const filtered = items.filter((item) => item.shift.shift_date.startsWith(month));

  const workers = useMemo(() => {
    const map = new Map<string, { name: string; verified: number; shiftCount: number }>();
    filtered.forEach((item) => {
      const current = map.get(item.worker_id) || {
        name: item.worker?.full_name || 'Ukjent',
        verified: 0,
        shiftCount: 0,
      };
      current.verified += Number(item.verified_hours || 0);
      current.shiftCount += 1;
      map.set(item.worker_id, current);
    });
    return [...map.values()].sort((a, b) => b.verified - a.verified);
  }, [filtered]);

  const totalVerified = filtered.reduce((total, item) => total + Number(item.verified_hours || 0), 0);
  const totalShifts = new Set(filtered.map((f) => f.shift_id)).size;

  return (
    <>
      <PageHeader
        eyebrow="Administrasjon"
        title="Rapporter"
        description="Oversikt over godkjente timer for Team Xtra, automatisk registrert når medarbeidere godkjennes for vakter."
        action={
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input w-auto"
          />
        }
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <Metric label="Godkjente timer" value={formatHours(totalVerified)} icon={<Clock3 className="w-5 h-5" />} />
        <Metric label="Gjennomførte vakter" value={totalShifts} icon={<CheckCircle2 className="w-5 h-5" />} />
        <Metric label="Medarbeidere" value={workers.length} icon={<Users className="w-5 h-5" />} />
      </div>

      <Card>
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-primary-950">Timer per medarbeider</h2>
          <p className="text-sm text-gray-500 mt-1">
            {formatMonthLabel(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1)}
          </p>
        </div>
        {workers.length === 0 ? (
          <Empty title="Ingen godkjente timer" text="Godkjente timer vises her automatisk når medarbeidere blir godkjent for vakter." />
        ) : (
          <div>
            {workers.map((worker, i) => (
              <div key={i} className="p-5 border-b border-gray-100 last:border-0 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold">
                  {worker.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-primary-950">{worker.name}</p>
                  <p className="text-sm text-gray-500">{worker.shiftCount} vakt{worker.shiftCount !== 1 ? 'er' : ''}</p>
                </div>
                <p className="text-lg font-bold text-primary-800">{formatHours(worker.verified)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
