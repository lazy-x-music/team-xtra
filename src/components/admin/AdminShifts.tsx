import { FormEvent, useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileCheck2,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  ApplicationWithWorker,
  ApplicationWithShiftAndWorker,
  Shift,
} from '@/types';
import {
  computeHours,
  formatDate,
  formatHours,
  formatShortDate,
  formatTimeRange,
  isShiftPast,
  shiftTypeLabel,
} from '@/utils/shiftHelpers';
import {
  Card,
  ConfirmDialog,
  Drawer,
  Empty,
  Field,
  Metric,
  Modal,
  Notice,
  PageHeader,
  SectionTitle,
  StatusBadge,
} from '@/components/ui';
import { todayStr } from '@/utils/holidays';

const today = todayStr();

export function AdminCampaigns({
  refresh,
  onRefresh,
}: {
  refresh: number;
  onRefresh: () => void;
}) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [applications, setApplications] = useState<ApplicationWithWorker[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Shift | null>(null);
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null);
  const [editHoursTarget, setEditHoursTarget] = useState<ApplicationWithWorker | null>(null);

  useEffect(() => {
    load();
  }, [refresh]);

  async function load() {
    const [{ data: shiftData }, { data: appData }] = await Promise.all([
      supabase.from('shifts').select('*').eq('shift_type', 'campaign').order('shift_date', { ascending: true }).order('start_time', { ascending: true }),
      supabase.from('shift_applications').select('*, worker:profiles!worker_id(full_name)').order('applied_at', { ascending: true }),
    ]);
    setShifts((shiftData || []) as Shift[]);
    setApplications((appData || []) as ApplicationWithWorker[]);
  }

  const upcoming = shifts.filter((s) => !isShiftPast(s));
  const past = shifts.filter((s) => isShiftPast(s));

  async function approve(id: string) {
    const { error } = await supabase.rpc('approve_application', { p_application_id: id });
    if (error) setNotice({ message: 'Kunne ikke godkjenne søknaden.', error: true });
    else {
      setNotice({ message: 'Søknaden er godkjent. Timene er registrert.' });
      load();
      onRefresh();
    }
  }

  async function removeWorker(id: string) {
    const { error } = await supabase.rpc('remove_application', { p_application_id: id });
    if (error) setNotice({ message: 'Kunne ikke fjerne medarbeideren.', error: true });
    else {
      setNotice({ message: 'Medarbeideren er fjernet fra kampanjen.' });
      load();
      onRefresh();
    }
  }

  async function deleteShift(id: string) {
    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) setNotice({ message: 'Kunne ikke slette kampanjen.', error: true });
    else {
      setNotice({ message: 'Kampanjen er slettet.' });
      setDeleteTarget(null);
      load();
      onRefresh();
    }
  }

  async function editHours(id: string, hours: number) {
    const { error } = await supabase.rpc('verify_application_hours', {
      p_application_id: id,
      p_hours: hours,
    });
    if (error) setNotice({ message: 'Kunne ikke oppdatere timene.', error: true });
    else {
      setNotice({ message: 'Timene er oppdatert.' });
      setEditHoursTarget(null);
      load();
      onRefresh();
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Administrasjon"
        title="Kampanjer"
        description="Opprett prosjektbaserte kampanjevakter der Team Xtra kan melde seg på, og godkjenn søkere opptil antall plasser."
        action={
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center justify-center gap-2 bg-primary-800 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Opprett kampanje
          </button>
        }
      />

      {notice && <Notice {...notice} onClose={() => setNotice(null)} />}

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <Metric label="Kommende kampanjer" value={upcoming.length} icon={<CalendarDays className="w-5 h-5" />} />
        <Metric label="Åpne søknader" value={applications.filter((a) => a.status === 'pending').length} icon={<Users className="w-5 h-5" />} />
        <Metric label="Godkjente timer" value={formatHours(applications.filter((a) => a.verified).reduce((sum, a) => sum + Number(a.verified_hours || 0), 0))} icon={<FileCheck2 className="w-5 h-5" />} />
      </div>

      <div className="space-y-4">
        <SectionTitle title="Kommende kampanjer" />
        <Card>
          {upcoming.length === 0 ? (
            <Empty title="Ingen kommende kampanjer" text="Opprett den første kampanjevakten for å komme i gang." />
          ) : (
            upcoming.map((shift) => (
              <CampaignRow
                key={shift.id}
                shift={shift}
                applications={applications.filter((a) => a.shift_id === shift.id)}
                onSelect={() => setSelected(shift)}
                onApprove={approve}
                onDelete={() => setDeleteTarget(shift)}
              />
            ))
          )}
        </Card>
      </div>

      {past.length > 0 && (
        <div className="space-y-4 mt-8">
          <SectionTitle title="Tidligere kampanjer" />
          <Card>
            {past.map((shift) => (
              <CampaignRow
                key={shift.id}
                shift={shift}
                applications={applications.filter((a) => a.shift_id === shift.id)}
                onSelect={() => setSelected(shift)}
                onApprove={approve}
                onDelete={() => setDeleteTarget(shift)}
              />
            ))}
          </Card>
        </div>
      )}

      {showForm && (
        <ShiftForm
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            load();
            onRefresh();
            setNotice({ message: 'Kampanjen er opprettet.' });
          }}
        />
      )}

      {selected && (
        <ApplicantDrawer
          shift={selected}
          applications={applications.filter((a) => a.shift_id === selected.id)}
          onClose={() => setSelected(null)}
          onApprove={approve}
          onRemove={removeWorker}
          onEditHours={(app) => setEditHoursTarget(app)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Slett kampanje"
          message={`Er du sikker på at du vil slette "${deleteTarget.title}"? Alle påmeldinger vil også bli fjernet. Dette kan ikke angres.`}
          confirmLabel="Slett kampanje"
          danger
          onConfirm={() => deleteShift(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {editHoursTarget && (
        <EditHoursModal
          application={editHoursTarget}
          onClose={() => setEditHoursTarget(null)}
          onSave={editHours}
        />
      )}
    </>
  );
}

function CampaignRow({
  shift,
  applications,
  onSelect,
  onApprove,
  onDelete,
}: {
  shift: Shift;
  applications: ApplicationWithWorker[];
  onSelect: () => void;
  onApprove: (id: string) => void;
  onDelete: () => void;
}) {
  const approved = applications.filter((a) => a.status === 'approved').length;
  const pending = applications.filter((a) => a.status === 'pending');
  const hours = computeHours(shift.start_time, shift.end_time);

  return (
    <div className="p-5 border-b border-gray-100 last:border-0 flex flex-col md:flex-row md:items-center gap-4">
      <div className="w-14 h-14 rounded-xl bg-accent-50 text-accent-700 flex flex-col items-center justify-center shrink-0">
        <span className="text-lg font-bold leading-none">
          {new Date(`${shift.shift_date}T00:00:00`).getDate()}
        </span>
        <span className="text-[10px] uppercase font-semibold">
          {new Date(`${shift.shift_date}T00:00:00`).toLocaleDateString('nb-NO', { month: 'short' })}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-primary-950">{shift.title}</h3>
          <StatusBadge status={shift.status} />
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {formatDate(shift.shift_date)} · {formatTimeRange(shift.start_time, shift.end_time)} · {hours} t
        </p>
        {shift.description && (
          <p className="text-sm text-gray-400 mt-1 truncate">{shift.description}</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-semibold text-primary-900">
            {approved} / {shift.required_workers}
          </p>
          <p className="text-xs text-gray-400">godkjent</p>
        </div>
        <button onClick={onDelete} className="p-2 rounded-lg hover:bg-error-50 text-gray-400 hover:text-error-600 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
        <button onClick={onSelect} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      {pending.length > 0 && (
        <div className="w-full md:w-auto md:ml-auto">
          <button
            onClick={() => onApprove(pending[0].id)}
            className="text-xs font-semibold text-primary-700 hover:text-primary-900"
          >
            Godkjenn neste søker <ArrowRight className="inline w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export function ShiftForm({
  onClose,
  onCreated,
  initialDate,
}: {
  onClose: () => void;
  onCreated: () => void;
  initialDate?: string;
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    shift_date: initialDate || today,
    start_time: '09:00',
    end_time: '15:00',
    required_workers: '5',
  });
  const [saving, setSaving] = useState(false);
  const hours = computeHours(form.start_time, form.end_time);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from('shifts').insert({
      ...form,
      required_workers: Number(form.required_workers),
      shift_type: 'campaign',
      created_by: user.user?.id,
    });
    setSaving(false);
    if (!error) onCreated();
  }

  return (
    <Modal title="Opprett ny kampanje" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tittel">
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Pakking av kampanje"
            className="input"
          />
        </Field>
        <Field label="Beskrivelse">
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Hva skal gjøres på kampanjen?"
            rows={3}
            className="input resize-none"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dato">
            <input required type="date" value={form.shift_date} onChange={(e) => setForm({ ...form, shift_date: e.target.value })} className="input" />
          </Field>
          <Field label="Antall medarbeidere">
            <input required type="number" min="1" value={form.required_workers} onChange={(e) => setForm({ ...form, required_workers: e.target.value })} className="input" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fra">
            <input required type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="input" />
          </Field>
          <Field label="Til">
            <input required type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="input" />
          </Field>
        </div>
        <div className="rounded-xl bg-primary-50 px-4 py-3 flex items-center gap-3 text-sm text-primary-800">
          <Clock3 className="w-4 h-4" />
          <span>Planlagt arbeidstid</span>
          <strong className="ml-auto">{hours > 0 ? `${hours} timer` : 'Ugyldig tidsrom'}</strong>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="button-secondary flex-1">Avbryt</button>
          <button disabled={saving || hours <= 0} className="button-primary flex-1">
            {saving ? 'Oppretter…' : 'Opprett kampanje'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ApplicantDrawer({
  shift,
  applications,
  onClose,
  onApprove,
  onRemove,
  onEditHours,
}: {
  shift: Shift;
  applications: ApplicationWithWorker[];
  onClose: () => void;
  onApprove: (id: string) => void;
  onRemove: (id: string) => void;
  onEditHours: (app: ApplicationWithWorker) => void;
}) {
  const approved = applications.filter((a) => a.status === 'approved').length;
  const scheduledHours = computeHours(shift.start_time, shift.end_time);

  return (
    <Drawer
      title={shift.title}
      subtitle={`${formatShortDate(shift.shift_date)} · ${formatTimeRange(shift.start_time, shift.end_time)}`}
      onClose={onClose}
    >
      <div className="p-6 border-b border-gray-100">
        <p className="text-sm text-gray-500">
          {approved} av {shift.required_workers} plasser fylt · {scheduledHours} timer per medarbeider
        </p>
      </div>
      <div className="p-6 space-y-3">
        {applications.length === 0 ? (
          <Empty title="Ingen søkere ennå" text="Søkerlisten fylles opp når Team Xtra melder seg på." />
        ) : (
          applications.map((app) => (
            <div key={app.id} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold">
                  {app.worker?.full_name?.charAt(0) || '?'}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{app.worker?.full_name || 'Ukjent medarbeider'}</p>
                  <p className="text-xs text-gray-400">
                    Søkte {new Date(app.applied_at).toLocaleDateString('nb-NO')}
                  </p>
                </div>
                <StatusBadge status={app.status} />
              </div>
              {app.status === 'approved' && app.verified && (
                <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  <Clock3 className="w-3.5 h-3.5" />
                  <span>Godkjent: {formatHours(Number(app.verified_hours || 0))}</span>
                  <button
                    onClick={() => onEditHours(app)}
                    className="ml-auto text-primary-700 hover:text-primary-900 font-semibold flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" /> Endre
                  </button>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                {app.status === 'pending' && (
                  <button
                    onClick={() => onApprove(app.id)}
                    className="flex-1 text-xs font-semibold bg-primary-800 text-white px-3 py-2 rounded-lg hover:bg-primary-700 flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" /> Godkjenn
                  </button>
                )}
                {(app.status === 'approved' || app.status === 'pending' || app.status === 'waitlist') && (
                  <button
                    onClick={() => onRemove(app.id)}
                    className="flex-1 text-xs font-semibold border border-error-200 text-error-600 px-3 py-2 rounded-lg hover:bg-error-50 flex items-center justify-center gap-1.5"
                  >
                    <UserMinus className="w-3.5 h-3.5" /> Fjern
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Drawer>
  );
}

function EditHoursModal({
  application,
  onClose,
  onSave,
}: {
  application: ApplicationWithWorker;
  onClose: () => void;
  onSave: (id: string, hours: number) => void;
}) {
  const scheduled = application.verified_hours || 0;
  const [hours, setHours] = useState(String(scheduled));

  return (
    <Modal title="Endre timer" onClose={onClose} maxWidth="sm:max-w-md">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold">
            {application.worker?.full_name?.charAt(0) || '?'}
          </div>
          <div>
            <p className="text-sm font-semibold">{application.worker?.full_name || 'Ukjent'}</p>
            <p className="text-xs text-gray-400">Godkjent: {formatHours(Number(scheduled))}</p>
          </div>
        </div>
        <Field label="Faktiske timer">
          <input type="number" min="0" max="24" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} className="input" />
        </Field>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="button-secondary flex-1">Avbryt</button>
          <button onClick={() => onSave(application.id, Number(hours))} className="button-primary flex-1">Lagre timer</button>
        </div>
      </div>
    </Modal>
  );
}
