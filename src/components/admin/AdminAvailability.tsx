import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Send,
  UserMinus,
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
  employeeLabel,
  formatDate,
  formatHours,
  formatMonthLabel,
  formatShortDate,
  formatTimeRange,
} from '@/utils/shiftHelpers';
import { Calendar, CalendarNav } from '@/components/Calendar';
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
import { localDateStr, todayStr } from '@/utils/holidays';

const today = todayStr();

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
  const [confirmedDates, setConfirmedDates] = useState<Set<string>>(new Set());
  const [approvedCounts, setApprovedCounts] = useState<Map<string, number>>(new Map());
  const [approvedByDate, setApprovedByDate] = useState<Map<string, ApplicationWithShiftAndWorker[]>>(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [setupWorker, setSetupWorker] = useState<AvailabilityWithWorker | null>(null);
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    load();
  }, [refresh, year, month]);

  async function load() {
    const start = localDateStr(new Date(year, month, 1));
    const end = localDateStr(new Date(year, month + 1, 0));

    const [{ data: availData }, { data: shiftData }, { data: appData }] = await Promise.all([
      supabase
        .from('worker_availability')
        .select('*, worker:profiles!worker_id(employee_number)')
        .gte('available_date', start)
        .lte('available_date', end),
      supabase
        .from('shifts')
        .select('shift_date, shift_type')
        .eq('shift_type', 'general')
        .gte('shift_date', start)
        .lte('shift_date', end),
      supabase
        .from('shift_applications')
        .select('*, shift:shifts(*), worker:profiles!worker_id(employee_number)')
        .eq('status', 'approved')
        .gte('shift.shift_date', start)
        .lte('shift.shift_date', end),
    ]);

    setAvailability((availData || []) as AvailabilityWithWorker[]);
    setConfirmedDates(new Set((shiftData || []).map((s: { shift_date: string }) => s.shift_date)));

    const apps = (appData || []) as ApplicationWithShiftAndWorker[];
    const countMap = new Map<string, number>();
    const byDate = new Map<string, ApplicationWithShiftAndWorker[]>();
    apps.forEach((a) => {
      const date = a.shift.shift_date;
      countMap.set(date, (countMap.get(date) || 0) + 1);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(a);
    });
    setApprovedCounts(countMap);
    setApprovedByDate(byDate);
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

  const approvedForDate = useMemo(() => {
    if (!selectedDate) return [];
    return approvedByDate.get(selectedDate) || [];
  }, [approvedByDate, selectedDate]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  }

  async function setupGeneralShift(workerId: string, date: string, startTime: string, endTime: string) {
    const { error } = await supabase.rpc('setup_general_shift', {
      p_worker_id: workerId,
      p_shift_date: date,
      p_start_time: startTime,
      p_end_time: endTime,
    });
    if (error) {
      setNotice({ message: 'Kunne ikke sette opp vakten.', error: true });
    } else {
      setNotice({ message: 'Medarbeideren er satt opp på vakt og har fått beskjed.' });
      setSetupWorker(null);
      load();
      onRefresh();
    }
  }

  async function cancelShift(applicationId: string) {
    const { error } = await supabase.rpc('cancel_shift', { p_application_id: applicationId });
    if (error) {
      setNotice({ message: 'Kunne ikke avlyse vakten.', error: true });
    } else {
      setNotice({ message: 'Vakten er avlyst. Medarbeideren har fått beskjed.' });
      load();
      onRefresh();
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Administrasjon"
        title="Tilgjengelighet"
        description="Se hvilke medarbeidere som er tilgjengelige per dag, og sett dem direkte opp på vakt. Klikk på en grønn dato for å se godkjente vakter."
      />

      {notice && <Notice {...notice} onClose={() => setNotice(null)} />}

      <Card className="p-5 sm:p-6">
        <CalendarNav year={year} month={month} onPrev={prevMonth} onNext={nextMonth} />
        <Calendar
          year={year}
          month={month}
          availabilityMap={availabilityMap}
          confirmedDates={confirmedDates}
          showAvailabilityCounts
          renderDayBadge={(dateStr) => {
            const count = approvedCounts.get(dateStr);
            if (count && count > 0) {
              return (
                <span className="text-[8px] font-bold bg-white/25 text-white rounded-full px-1.5 py-0.5 leading-none">
                  {count} godkjent
                </span>
              );
            }
            return null;
          }}
          onDateClick={(dateStr) => setSelectedDate(dateStr)}
          selectableFilter={() => true}
        />
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-gray-50 border border-gray-200" /> Helg / helligdag
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-accent-500 text-white text-[8px] flex items-center justify-center font-bold">N</span>
            N tilgjengelige
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-success-500" /> Bekreftet vakt
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold bg-success-100 text-success-700 rounded-full px-1.5 py-0.5">N godkjent</span>
            Antall godkjente
          </span>
        </div>
      </Card>

      {selectedDate && (
        <Drawer
          title={formatDate(selectedDate)}
          subtitle="Tilgjengelige medarbeidere og godkjente vakter"
          onClose={() => setSelectedDate(null)}
        >
          <div className="p-6">
            {approvedForDate.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-primary-950 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success-600" />
                  Godkjente vakter ({approvedForDate.length})
                </h3>
                <div className="space-y-3">
                  {approvedForDate.map((app) => (
                    <div key={app.id} className="flex items-center gap-3 p-3 border border-success-200 bg-success-50/50 rounded-xl">
                      <div className="w-9 h-9 rounded-full bg-success-100 text-success-700 flex items-center justify-center font-semibold text-xs">
                        #{app.worker?.employee_number ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{employeeLabel(app.worker?.employee_number)}</p>
                        <p className="text-xs text-gray-500">
                          {formatTimeRange(app.shift.start_time, app.shift.end_time)} · {formatHours(Number(app.verified_hours || 0))}
                        </p>
                      </div>
                      <button
                        onClick={() => cancelShift(app.id)}
                        className="text-xs font-semibold border border-error-200 text-error-600 px-3 py-2 rounded-lg hover:bg-error-50 flex items-center gap-1.5 transition-colors"
                      >
                        <UserMinus className="w-3.5 h-3.5" /> Fjern fra vakt
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h3 className="text-sm font-bold text-gray-700 mb-3">
              Tilgjengelige medarbeidere ({workersForDate.length})
            </h3>
            {workersForDate.length === 0 ? (
              <Empty title="Ingen tilgjengelige" text="Ingen medarbeidere har markert seg som tilgjengelige på denne datoen." />
            ) : (
              <div className="space-y-3">
                {workersForDate.map((w) => (
                  <div key={w.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl">
                    <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-xs">
                      #{w.worker?.employee_number ?? '?'}
                    </div>
                    <p className="text-sm font-semibold flex-1">{employeeLabel(w.worker?.employee_number)}</p>
                    <button
                      onClick={() => setSetupWorker(w)}
                      className="text-xs font-semibold bg-primary-800 text-white px-3 py-2 rounded-lg hover:bg-primary-700 flex items-center gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Set opp på vakt
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Drawer>
      )}

      {setupWorker && (
        <SetupShiftModal
          worker={setupWorker}
          onClose={() => setSetupWorker(null)}
          onConfirm={(startTime, endTime) =>
            setupGeneralShift(setupWorker.worker_id, setupWorker.available_date, startTime, endTime)
          }
        />
      )}
    </>
  );
}

function SetupShiftModal({
  worker,
  onClose,
  onConfirm,
}: {
  worker: AvailabilityWithWorker;
  onClose: () => void;
  onConfirm: (startTime: string, endTime: string) => void;
}) {
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('15:00');
  const hours = computeHours(startTime, endTime);

  return (
    <Modal title="Set opp på vakt" onClose={onClose} maxWidth="sm:max-w-md">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-xs">
            #{worker.worker?.employee_number ?? '?'}
          </div>
          <div>
            <p className="text-sm font-semibold">{employeeLabel(worker.worker?.employee_number)}</p>
            <p className="text-xs text-gray-500">{formatShortDate(worker.available_date)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fra">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" />
          </Field>
          <Field label="Til">
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input" />
          </Field>
        </div>
        <div className="rounded-xl bg-primary-50 px-4 py-3 flex items-center gap-3 text-sm text-primary-800">
          <Clock3 className="w-4 h-4" />
          <span>Planlagt arbeidstid</span>
          <strong className="ml-auto">{hours > 0 ? `${hours} timer` : 'Ugyldig tidsrom'}</strong>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="button-secondary flex-1">Avbryt</button>
          <button
            disabled={hours <= 0}
            onClick={() => onConfirm(startTime, endTime)}
            className="button-primary flex-1"
          >
            Bekreft vakt
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function AdminReports({ refresh }: { refresh: number }) {
  const [items, setItems] = useState<ApplicationWithShiftAndWorker[]>([]);
  const [month, setMonth] = useState(today.slice(0, 7));

  useEffect(() => {
    supabase
      .from('shift_applications')
      .select('*, shift:shifts(*), worker:profiles!worker_id(employee_number)')
      .eq('verified', true)
      .then(({ data }) => setItems((data || []) as ApplicationWithShiftAndWorker[]));
  }, [refresh]);

  const filtered = items.filter((item) => item.shift.shift_date.startsWith(month));

  const workers = useMemo(() => {
    const map = new Map<string, { name: string; verified: number; shiftCount: number }>();
    filtered.forEach((item) => {
      const current = map.get(item.worker_id) || {
        name: employeeLabel(item.worker?.employee_number),
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
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input w-auto" />
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
                <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs">
                  {worker.name.replace('Ansatt #', '')}
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
