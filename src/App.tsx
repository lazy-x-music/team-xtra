import { FormEvent, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { AuthScreen } from '@/components/AuthScreen';
import { useAuth, AuthProvider } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ApplicationWithShift, ApplicationWithShiftAndWorker, ApplicationWithWorker, Shift } from '@/types';
import {
  computeHours,
  formatDate,
  formatHours,
  formatMonthLabel,
  formatShortDate,
  formatTimeRange,
  isShiftPast,
} from '@/utils/shiftHelpers';

type AdminPage = 'shifts' | 'approval' | 'reports';
type WorkerPage = 'shifts' | 'my-shifts';

const today = new Date().toISOString().slice(0, 10);

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { session, profile, loading, signOut } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session || !profile) return <AuthScreen />;
  return profile.role === 'admin' ? <AdminApp onSignOut={signOut} /> : <WorkerApp onSignOut={signOut} />;
}

function LoadingScreen() {
  return <div className="min-h-screen bg-primary-950 flex items-center justify-center text-white">Laster vaktplan…</div>;
}

function AdminApp({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [page, setPage] = useState<AdminPage>('shifts');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const refreshData = () => setRefresh((value) => value + 1);
  const nav = [
    { id: 'shifts' as const, label: 'Vakter', icon: CalendarDays },
    { id: 'approval' as const, label: 'Godkjenning', icon: FileCheck2 },
    { id: 'reports' as const, label: 'Rapporter', icon: BarChart3 },
  ];

  return (
    <AppFrame roleLabel="Aksell Management" nav={nav} active={page} onChange={(value) => { setPage(value); setMobileOpen(false); }} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} onSignOut={onSignOut}>
      {page === 'shifts' && <AdminShifts refresh={refresh} onRefresh={refreshData} />}
      {page === 'approval' && <Approval refresh={refresh} onRefresh={refreshData} />}
      {page === 'reports' && <Reports refresh={refresh} />}
    </AppFrame>
  );
}

function WorkerApp({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [page, setPage] = useState<WorkerPage>('shifts');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const nav = [
    { id: 'shifts' as const, label: 'Vakter', icon: CalendarDays },
    { id: 'my-shifts' as const, label: 'Mine vakter', icon: CheckCircle2 },
  ];
  return (
    <AppFrame roleLabel="Team Xtra" nav={nav} active={page} onChange={(value) => { setPage(value); setMobileOpen(false); }} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} onSignOut={onSignOut}>
      {page === 'shifts' && <WorkerShifts refresh={refresh} onRefresh={() => setRefresh((value) => value + 1)} />}
      {page === 'my-shifts' && <MyShifts refresh={refresh} />}
    </AppFrame>
  );
}

function AppFrame<T extends string>({ roleLabel, nav, active, onChange, mobileOpen, setMobileOpen, onSignOut, children }: {
  roleLabel: string;
  nav: { id: T; label: string; icon: typeof CalendarDays }[];
  active: T;
  onChange: (id: T) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  onSignOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f5f7f9] text-gray-900">
      <aside className={`fixed inset-y-0 left-0 z-30 w-72 bg-primary-950 text-white transform transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-full flex-col p-5">
          <div className="flex items-center gap-3 px-2 py-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-accent-500 flex items-center justify-center"><CalendarPlus className="w-5 h-5" /></div>
            <div><p className="font-bold tracking-tight">Aksell</p><p className="text-xs text-primary-300">Vaktplan</p></div>
          </div>
          <div className="px-3 mb-3 text-[11px] font-semibold tracking-[0.14em] text-primary-400 uppercase">Arbeidsflate</div>
          <nav className="space-y-1">
            {nav.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => onChange(id)} className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${active === id ? 'bg-white text-primary-900' : 'text-primary-200 hover:bg-primary-900'}`}><Icon className="w-[18px] h-[18px]" />{label}{active === id && <ChevronRight className="w-4 h-4 ml-auto" />}</button>)}
          </nav>
          <div className="mt-auto border-t border-primary-800 pt-4">
            <div className="flex items-center gap-3 px-3 py-3 mb-2"><div className="w-9 h-9 rounded-full bg-primary-700 flex items-center justify-center text-sm font-semibold"><ShieldCheck className="w-4 h-4" /></div><div className="min-w-0"><p className="text-sm font-medium truncate">{roleLabel}</p><p className="text-xs text-primary-400">Innlogget</p></div></div>
            <button onClick={onSignOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-primary-300 hover:text-white hover:bg-primary-900"><LogOut className="w-4 h-4" />Logg ut</button>
          </div>
        </div>
      </aside>
      {mobileOpen && <button aria-label="Lukk meny" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-20 bg-primary-950/40 lg:hidden" />}
      <div className="lg:pl-72">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-10"><button className="lg:hidden p-2 text-gray-600" onClick={() => setMobileOpen(true)}><Menu className="w-5 h-5" /></button><div className="lg:hidden font-bold text-primary-900">Aksell Vaktplan</div><div className="hidden lg:block" /><div className="w-8 h-8 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center"><Users className="w-4 h-4" /></div></header>
        <main className="p-4 sm:p-8 max-w-[1440px] mx-auto">{children}</main>
      </div>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8"><div><p className="text-xs font-bold tracking-[0.16em] uppercase text-accent-600 mb-2">{eyebrow}</p><h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary-950">{title}</h1><p className="text-gray-500 mt-2 max-w-2xl">{description}</p></div>{action}</div>;
}

function Notice({ message, error = false, onClose }: { message: string; error?: boolean; onClose: () => void }) {
  return <div className={`mb-5 rounded-xl px-4 py-3 flex items-center gap-3 text-sm ${error ? 'bg-error-50 text-error-700' : 'bg-success-50 text-success-700'}`}><AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{message}</span><button onClick={onClose}><X className="w-4 h-4" /></button></div>;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    open: { label: 'Åpen', cls: 'bg-success-50 text-success-700' }, fullsatt: { label: 'Fullsatt', cls: 'bg-primary-100 text-primary-700' }, pending: { label: 'Til behandling', cls: 'bg-warning-50 text-warning-700' }, approved: { label: 'Godkjent', cls: 'bg-success-50 text-success-700' }, waitlist: { label: 'Venteliste', cls: 'bg-warning-50 text-warning-700' }, rejected: { label: 'Avslått', cls: 'bg-gray-100 text-gray-500' }, completed: { label: 'Fullført', cls: 'bg-primary-100 text-primary-700' },
  };
  const item = config[status] || config.pending;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${item.cls}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{item.label}</span>;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <div className={`bg-white border border-gray-200 rounded-2xl shadow-sm ${className}`}>{children}</div>; }

function AdminShifts({ refresh, onRefresh }: { refresh: number; onRefresh: () => void }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [applications, setApplications] = useState<ApplicationWithWorker[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Shift | null>(null);
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  useEffect(() => { load(); }, [refresh]);
  async function load() {
    const [{ data: shiftData }, { data: appData }] = await Promise.all([
      supabase.from('shifts').select('*').order('shift_date', { ascending: true }).order('start_time', { ascending: true }),
      supabase.from('shift_applications').select('*, worker:profiles!worker_id(full_name)').order('applied_at', { ascending: true }),
    ]);
    setShifts((shiftData || []) as Shift[]); setApplications((appData || []) as ApplicationWithWorker[]);
  }
  const upcoming = shifts.filter((shift) => !isShiftPast(shift));
  const past = shifts.filter((shift) => isShiftPast(shift));
  async function approve(id: string) { const { error } = await supabase.rpc('approve_application', { p_application_id: id }); if (error) setNotice({ message: 'Kunne ikke godkjenne søknaden.', error: true }); else { setNotice({ message: 'Søknaden er oppdatert.' }); load(); onRefresh(); } }
  return <>
    <PageHeader eyebrow="Administrasjon" title="Vakter" description="Opprett og administrer bemanningen for Team Xtra." action={<button onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 bg-primary-800 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors"><Plus className="w-4 h-4" />Opprett vakt</button>} />
    {notice && <Notice {...notice} onClose={() => setNotice(null)} />}
    <div className="grid sm:grid-cols-3 gap-4 mb-8"><Metric label="Kommende vakter" value={upcoming.length} icon={<CalendarDays />} /><Metric label="Åpne søknader" value={applications.filter((a) => a.status === 'pending').length} icon={<Users />} /><Metric label="Til godkjenning" value={past.filter((shift) => applications.some((a) => a.shift_id === shift.id && a.status === 'approved' && !a.verified)).length} icon={<FileCheck2 />} /></div>
    <div className="space-y-4"><SectionTitle title="Kommende vakter" /><Card>{upcoming.length === 0 ? <Empty title="Ingen kommende vakter" text="Opprett den første vakten for å komme i gang." /> : upcoming.map((shift) => <ShiftAdminRow key={shift.id} shift={shift} applications={applications.filter((a) => a.shift_id === shift.id)} onSelect={() => setSelected(shift)} onApprove={approve} />)}</Card></div>
    {past.length > 0 && <div className="space-y-4 mt-8"><SectionTitle title="Tidligere vakter" /><Card>{past.slice(0, 5).map((shift) => <ShiftAdminRow key={shift.id} shift={shift} applications={applications.filter((a) => a.shift_id === shift.id)} onSelect={() => setSelected(shift)} onApprove={approve} />)}</Card></div>}
    {showForm && <ShiftForm onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); load(); onRefresh(); setNotice({ message: 'Vakten er opprettet.' }); }} />}
    {selected && <ApplicantDrawer shift={selected} applications={applications.filter((a) => a.shift_id === selected.id)} onClose={() => setSelected(null)} onApprove={approve} />}
  </>;
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) { return <Card className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">{label}</p><p className="text-2xl font-bold text-primary-950 mt-2">{value}</p></div><div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">{icon}</div></div></Card>; }
function SectionTitle({ title }: { title: string }) { return <div className="flex items-center justify-between"><h2 className="font-bold text-primary-950">{title}</h2><span className="h-px bg-gray-200 flex-1 ml-4" /></div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="py-14 text-center"><CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-3" /><p className="font-semibold text-gray-700">{title}</p><p className="text-sm text-gray-400 mt-1">{text}</p></div>; }
function ShiftAdminRow({ shift, applications, onSelect, onApprove }: { shift: Shift; applications: ApplicationWithWorker[]; onSelect: () => void; onApprove: (id: string) => void }) { const approved = applications.filter((a) => a.status === 'approved').length; const pending = applications.filter((a) => a.status === 'pending'); return <div className="p-5 border-b border-gray-100 last:border-0 flex flex-col md:flex-row md:items-center gap-4"><div className="w-14 h-14 rounded-xl bg-primary-50 text-primary-800 flex flex-col items-center justify-center shrink-0"><span className="text-lg font-bold leading-none">{new Date(`${shift.shift_date}T00:00:00`).getDate()}</span><span className="text-[10px] uppercase font-semibold">{new Date(`${shift.shift_date}T00:00:00`).toLocaleDateString('nb-NO', { month: 'short' })}</span></div><div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-primary-950">{shift.title}</h3><StatusBadge status={shift.status} /></div><p className="text-sm text-gray-500 mt-1">{formatDate(shift.shift_date)} · {formatTimeRange(shift.start_time, shift.end_time)} · {computeHours(shift.start_time, shift.end_time)} t</p><p className="text-sm text-gray-400 mt-1 truncate">{shift.description || 'Ingen beskrivelse'}</p></div><div className="flex items-center gap-4"><div className="text-right"><p className="text-sm font-semibold text-primary-900">{approved} / {shift.required_workers}</p><p className="text-xs text-gray-400">godkjent</p></div><button onClick={onSelect} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight className="w-5 h-5" /></button></div>{pending.length > 0 && <div className="w-full md:w-auto"><button onClick={() => onApprove(pending[0].id)} className="text-xs font-semibold text-primary-700 hover:text-primary-900">Godkjenn neste søker <ArrowRight className="inline w-3 h-3" /></button></div>}</div>; }

function ShiftForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) { const [form, setForm] = useState({ title: '', description: '', shift_date: today, start_time: '09:00', end_time: '15:00', required_workers: '3' }); const [saving, setSaving] = useState(false); const hours = computeHours(form.start_time, form.end_time); async function submit(e: FormEvent) { e.preventDefault(); setSaving(true); const { data: user } = await supabase.auth.getUser(); const { error } = await supabase.from('shifts').insert({ ...form, required_workers: Number(form.required_workers), created_by: user.user?.id }); setSaving(false); if (!error) onCreated(); } return <Modal title="Opprett ny vakt" onClose={onClose}><form onSubmit={submit} className="space-y-4"><Field label="Tittel"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Pakking av kampanje" className="input" /></Field><Field label="Beskrivelse"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Hva skal gjøres på vakten?" rows={3} className="input resize-none" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Dato"><input required type="date" value={form.shift_date} onChange={(e) => setForm({ ...form, shift_date: e.target.value })} className="input" /></Field><Field label="Antall medarbeidere"><input required type="number" min="1" value={form.required_workers} onChange={(e) => setForm({ ...form, required_workers: e.target.value })} className="input" /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Fra"><input required type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="input" /></Field><Field label="Til"><input required type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="input" /></Field></div><div className="rounded-xl bg-primary-50 px-4 py-3 flex items-center gap-3 text-sm text-primary-800"><Clock3 className="w-4 h-4" /><span>Planlagt arbeidstid</span><strong className="ml-auto">{hours > 0 ? `${hours} timer` : 'Ugyldig tidsrom'}</strong></div><div className="flex gap-3 pt-2"><button type="button" onClick={onClose} className="button-secondary flex-1">Avbryt</button><button disabled={saving || hours <= 0} className="button-primary flex-1">{saving ? 'Oppretter…' : 'Opprett vakt'}</button></div></form></Modal>; }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-primary-950/40 p-0 sm:p-4"><div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-auto"><div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between"><h2 className="font-bold text-primary-950">{title}</h2><button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button></div><div className="p-6">{children}</div></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="block text-sm font-medium text-gray-700 mb-1.5">{label}</span>{children}</label>; }
function ApplicantDrawer({ shift, applications, onClose, onApprove }: { shift: Shift; applications: ApplicationWithWorker[]; onClose: () => void; onApprove: (id: string) => void }) { return <div className="fixed inset-0 z-40 bg-primary-950/30"><button className="absolute inset-0" onClick={onClose} aria-label="Lukk" /><aside className="absolute right-0 top-0 bottom-0 bg-white w-full sm:max-w-md shadow-2xl overflow-auto"><div className="p-6 border-b border-gray-100"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-accent-600">{formatShortDate(shift.shift_date)} · {formatTimeRange(shift.start_time, shift.end_time)}</p><h2 className="text-xl font-bold text-primary-950 mt-2">{shift.title}</h2></div><button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button></div><p className="text-sm text-gray-500 mt-3">{applications.filter((a) => a.status === 'approved').length} av {shift.required_workers} plasser fylt</p></div><div className="p-6 space-y-3">{applications.length === 0 ? <Empty title="Ingen søkere ennå" text="Søkerlisten fylles opp når Team Xtra melder seg på." /> : applications.map((app) => <div key={app.id} className="border border-gray-200 rounded-xl p-4 flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold">{app.worker?.full_name?.charAt(0) || '?'}</div><div className="flex-1"><p className="text-sm font-semibold">{app.worker?.full_name || 'Ukjent medarbeider'}</p><p className="text-xs text-gray-400">Søkte {new Date(app.applied_at).toLocaleDateString('nb-NO')}</p></div>{app.status === 'pending' ? <button onClick={() => onApprove(app.id)} className="text-xs font-semibold bg-primary-800 text-white px-3 py-2 rounded-lg">Godkjenn</button> : <StatusBadge status={app.status} />}</div>)}</div></aside></div>; }

function Approval({ refresh, onRefresh }: { refresh: number; onRefresh: () => void }) { const [items, setItems] = useState<ApplicationWithShiftAndWorker[]>([]); const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null); useEffect(() => { load(); }, [refresh]); async function load() { const { data } = await supabase.from('shift_applications').select('*, shift:shifts(*), worker:profiles!worker_id(full_name)').eq('status', 'approved').eq('verified', false); setItems((data || []) as ApplicationWithShiftAndWorker[]); } async function verify(id: string, hours: number) { const { error } = await supabase.rpc('verify_application_hours', { p_application_id: id, p_hours: hours }); if (error) setNotice({ message: 'Kunne ikke lagre timene.', error: true }); else { setNotice({ message: 'Timer godkjent.' }); load(); onRefresh(); } } return <><PageHeader eyebrow="Administrasjon" title="Til godkjenning" description="Kontroller og bekreft timer for vakter som er gjennomført." />{notice && <Notice {...notice} onClose={() => setNotice(null)} />}{items.length === 0 ? <Card><Empty title="Alt er oppdatert" text="Ingen vakter venter på timegodkjenning akkurat nå." /></Card> : <div className="space-y-4">{items.map((item) => <VerificationCard key={item.id} item={item} onVerify={verify} />)}</div>}</>; }
function VerificationCard({ item, onVerify }: { item: ApplicationWithShiftAndWorker; onVerify: (id: string, hours: number) => void }) { const scheduled = computeHours(item.shift.start_time, item.shift.end_time); const [hours, setHours] = useState(String(scheduled)); return <Card className="p-5"><div className="flex flex-col sm:flex-row sm:items-center gap-4"><div className="w-12 h-12 rounded-xl bg-accent-50 text-accent-700 flex items-center justify-center"><Clock3 className="w-5 h-5" /></div><div className="flex-1"><p className="text-xs font-bold uppercase tracking-wider text-gray-400">{formatShortDate(item.shift.shift_date)} · {formatTimeRange(item.shift.start_time, item.shift.end_time)}</p><h3 className="font-bold text-primary-950 mt-1">{item.worker?.full_name || 'Ukjent medarbeider'}</h3><p className="text-sm text-gray-500">{item.shift.title} · Planlagt {scheduled} timer</p></div><div className="flex items-end gap-2"><Field label="Faktiske timer"><input type="number" min="0" max="24" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} className="input w-28" /></Field><button onClick={() => onVerify(item.id, Number(hours))} className="button-primary h-[42px] flex items-center gap-2"><Check className="w-4 h-4" />Godkjenn</button></div></div></Card>; }

function Reports({ refresh }: { refresh: number }) { const [items, setItems] = useState<ApplicationWithShiftAndWorker[]>([]); const [month, setMonth] = useState(today.slice(0, 7)); useEffect(() => { supabase.from('shift_applications').select('*, shift:shifts(*), worker:profiles!worker_id(full_name)').eq('verified', true).then(({ data }) => setItems((data || []) as ApplicationWithShiftAndWorker[])); }, [refresh]); const filtered = items.filter((item) => item.shift.shift_date.startsWith(month)); const workers = useMemo(() => { const map = new Map<string, { name: string; verified: number; scheduled: number }>(); filtered.forEach((item) => { const current = map.get(item.worker_id) || { name: item.worker?.full_name || 'Ukjent', verified: 0, scheduled: 0 }; current.verified += Number(item.verified_hours || 0); current.scheduled += computeHours(item.shift.start_time, item.shift.end_time); map.set(item.worker_id, current); }); return [...map.values()].sort((a, b) => b.verified - a.verified); }, [filtered]); const scheduled = filtered.reduce((total, item) => total + computeHours(item.shift.start_time, item.shift.end_time), 0); const verified = filtered.reduce((total, item) => total + Number(item.verified_hours || 0), 0); return <><PageHeader eyebrow="Administrasjon" title="Rapporter" description="Se godkjente timer for Team Xtra og sammenlign planlagt mot faktisk arbeid." action={<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input w-auto" />} /><div className="grid sm:grid-cols-3 gap-4 mb-8"><Metric label="Planlagte timer" value={formatHours(scheduled)} icon={<CalendarDays />} /><Metric label="Godkjente timer" value={formatHours(verified)} icon={<CheckCircle2 />} /><Metric label="Medarbeidere" value={workers.length} icon={<Users />} /></div><Card><div className="p-5 border-b border-gray-100"><h2 className="font-bold text-primary-950">Timer per medarbeider</h2><p className="text-sm text-gray-500 mt-1">{formatMonthLabel(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1)}</p></div>{workers.length === 0 ? <Empty title="Ingen godkjente timer" text="Godkjente timer vil vises her." /> : <div>{workers.map((worker) => <div key={worker.name} className="p-5 border-b border-gray-100 last:border-0 flex items-center gap-4"><div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold">{worker.name.charAt(0)}</div><div className="flex-1"><p className="font-semibold text-primary-950">{worker.name}</p><p className="text-sm text-gray-500">Planlagt {formatHours(worker.scheduled)}</p></div><p className="text-lg font-bold text-primary-800">{formatHours(worker.verified)}</p></div>)}</div>}</Card></>; }

function WorkerShifts({ refresh, onRefresh }: { refresh: number; onRefresh: () => void }) { const [shifts, setShifts] = useState<Shift[]>([]); const [apps, setApps] = useState<ApplicationWithShift[]>([]); const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null); useEffect(() => { load(); }, [refresh]); async function load() { const [{ data: shiftsData }, { data: appsData }] = await Promise.all([supabase.from('shifts').select('*').eq('status', 'open').order('shift_date'), supabase.from('shift_applications').select('*, shift:shifts(*)')]); setShifts((shiftsData || []) as Shift[]); setApps((appsData || []) as ApplicationWithShift[]); } async function apply(shiftId: string) { const { error } = await supabase.from('shift_applications').insert({ shift_id: shiftId }); if (error) setNotice({ message: 'Du er allerede påmeldt, eller vakten er ikke lenger åpen.', error: true }); else { setNotice({ message: 'Du er meldt på vakten.' }); load(); onRefresh(); } } const open = shifts.filter((s) => !isShiftPast(s)); return <><PageHeader eyebrow="Team Xtra" title="Finn en vakt" description="Se ledige vakter og meld deg på når det passer." />{notice && <Notice {...notice} onClose={() => setNotice(null)} />}{open.length === 0 ? <Card><Empty title="Ingen åpne vakter" text="Det finnes ingen ledige vakter akkurat nå. Sjekk igjen senere." /></Card> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{open.map((shift) => { const existing = apps.find((a) => a.shift_id === shift.id); return <Card key={shift.id} className="p-5 hover:shadow-md transition-shadow"><div className="flex items-start justify-between"><div className="w-12 h-12 rounded-xl bg-accent-50 text-accent-700 flex flex-col items-center justify-center"><span className="font-bold leading-none">{new Date(`${shift.shift_date}T00:00:00`).getDate()}</span><span className="text-[10px] uppercase font-semibold">{new Date(`${shift.shift_date}T00:00:00`).toLocaleDateString('nb-NO', { month: 'short' })}</span></div>{existing ? <StatusBadge status={existing.status} /> : <span className="text-xs font-semibold text-success-700">{shift.required_workers} plasser</span>}</div><h3 className="font-bold text-primary-950 mt-5">{shift.title}</h3><p className="text-sm text-gray-500 mt-2">{formatDate(shift.shift_date)}</p><div className="flex items-center gap-2 text-sm text-gray-600 mt-1"><Clock3 className="w-4 h-4 text-gray-400" />{formatTimeRange(shift.start_time, shift.end_time)} · {computeHours(shift.start_time, shift.end_time)} t</div>{shift.description && <p className="text-sm text-gray-500 mt-4 leading-relaxed">{shift.description}</p>}{!existing && <button onClick={() => apply(shift.id)} className="button-primary w-full mt-5">Meld meg på <ArrowRight className="w-4 h-4" /></button>}</Card>; })}</div>}</>; }

function MyShifts({ refresh }: { refresh: number }) { const [items, setItems] = useState<ApplicationWithShift[]>([]); const [verified, setVerified] = useState(0); useEffect(() => { load(); }, [refresh]); async function load() { const { data } = await supabase.from('shift_applications').select('*, shift:shifts(*)').order('applied_at', { ascending: false }); const list = (data || []) as ApplicationWithShift[]; setItems(list); const currentMonth = today.slice(0, 7); setVerified(list.filter((a) => a.verified && a.shift.shift_date.startsWith(currentMonth)).reduce((sum, a) => sum + Number(a.verified_hours || 0), 0)); } return <><PageHeader eyebrow="Team Xtra" title="Mine vakter" description="Hold oversikt over påmeldte vakter og godkjente timer." action={<div className="rounded-xl bg-primary-900 text-white px-4 py-3"><p className="text-xs text-primary-300">Godkjent denne måneden</p><p className="text-lg font-bold mt-0.5">{formatHours(verified)}</p></div>} /><Card>{items.length === 0 ? <Empty title="Du har ingen vakter ennå" text="Finn en ledig vakt og meld deg på." /> : items.map((item) => <div key={item.id} className="p-5 border-b border-gray-100 last:border-0 flex items-center gap-4"><div className="hidden sm:flex w-12 h-12 rounded-xl bg-primary-50 text-primary-800 flex-col items-center justify-center"><span className="font-bold leading-none">{new Date(`${item.shift.shift_date}T00:00:00`).getDate()}</span><span className="text-[10px] uppercase">{new Date(`${item.shift.shift_date}T00:00:00`).toLocaleDateString('nb-NO', { month: 'short' })}</span></div><div className="flex-1"><h3 className="font-semibold text-primary-950">{item.shift.title}</h3><p className="text-sm text-gray-500 mt-1">{formatDate(item.shift.shift_date)} · {formatTimeRange(item.shift.start_time, item.shift.end_time)}</p></div><div className="text-right"><StatusBadge status={item.verified ? 'completed' : item.status} />{item.verified && <p className="text-xs text-gray-500 mt-1">{formatHours(Number(item.verified_hours || 0))}</p>}</div></div>)}</Card></>; }

export default App;
