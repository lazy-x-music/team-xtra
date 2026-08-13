import { useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { AuthScreen } from '@/components/AuthScreen';
import { useAuth, AuthProvider } from '@/contexts/AuthContext';
import { AdminShifts } from '@/components/admin/AdminShifts';
import { AdminAvailability, AdminReports } from '@/components/admin/AdminAvailability';
import { WorkerAvailability, WorkerShifts, MyShifts } from '@/components/worker/WorkerScreens';

type AdminPage = 'shifts' | 'availability' | 'reports';
type WorkerPage = 'availability' | 'shifts' | 'my-shifts';

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
  return profile.role === 'admin' ? (
    <AdminApp onSignOut={signOut} />
  ) : (
    <WorkerApp onSignOut={signOut} />
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-primary-950 flex items-center justify-center text-white">
      Laster vaktplan…
    </div>
  );
}

function AdminApp({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [page, setPage] = useState<AdminPage>('shifts');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const refreshData = () => setRefresh((v) => v + 1);

  const nav = [
    { id: 'shifts' as const, label: 'Vakter', icon: CalendarDays },
    { id: 'availability' as const, label: 'Tilgjengelighet', icon: Users },
    { id: 'reports' as const, label: 'Rapporter', icon: BarChart3 },
  ];

  return (
    <AppFrame
      roleLabel="Aksell Management"
      nav={nav}
      active={page}
      onChange={(v) => {
        setPage(v);
        setMobileOpen(false);
      }}
      mobileOpen={mobileOpen}
      setMobileOpen={setMobileOpen}
      onSignOut={onSignOut}
    >
      {page === 'shifts' && <AdminShifts refresh={refresh} onRefresh={refreshData} />}
      {page === 'availability' && <AdminAvailability refresh={refresh} onRefresh={refreshData} />}
      {page === 'reports' && <AdminReports refresh={refresh} />}
    </AppFrame>
  );
}

function WorkerApp({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [page, setPage] = useState<WorkerPage>('shifts');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const refreshData = () => setRefresh((v) => v + 1);

  const nav = [
    { id: 'shifts' as const, label: 'Vakter', icon: CalendarDays },
    { id: 'availability' as const, label: 'Tilgjengelig', icon: CheckCircle2 },
    { id: 'my-shifts' as const, label: 'Mine vakter', icon: CalendarPlus },
  ];

  return (
    <AppFrame
      roleLabel="Team Xtra"
      nav={nav}
      active={page}
      onChange={(v) => {
        setPage(v);
        setMobileOpen(false);
      }}
      mobileOpen={mobileOpen}
      setMobileOpen={setMobileOpen}
      onSignOut={onSignOut}
    >
      {page === 'shifts' && <WorkerShifts refresh={refresh} onRefresh={refreshData} />}
      {page === 'availability' && <WorkerAvailability refresh={refresh} onRefresh={refreshData} />}
      {page === 'my-shifts' && <MyShifts refresh={refresh} />}
    </AppFrame>
  );
}

function AppFrame<T extends string>({
  roleLabel,
  nav,
  active,
  onChange,
  mobileOpen,
  setMobileOpen,
  onSignOut,
  children,
}: {
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
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-72 bg-primary-950 text-white transform transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col p-5">
          <div className="flex items-center gap-3 px-2 py-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-accent-500 flex items-center justify-center">
              <CalendarPlus className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold tracking-tight">Aksell</p>
              <p className="text-xs text-primary-300">Vaktplan</p>
            </div>
          </div>
          <div className="px-3 mb-3 text-[11px] font-semibold tracking-[0.14em] text-primary-400 uppercase">
            Arbeidsflate
          </div>
          <nav className="space-y-1">
            {nav.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onChange(id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                  active === id ? 'bg-white text-primary-900' : 'text-primary-200 hover:bg-primary-900'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                {label}
                {active === id && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            ))}
          </nav>
          <div className="mt-auto border-t border-primary-800 pt-4">
            <div className="flex items-center gap-3 px-3 py-3 mb-2">
              <div className="w-9 h-9 rounded-full bg-primary-700 flex items-center justify-center text-sm font-semibold">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{roleLabel}</p>
                <p className="text-xs text-primary-400">Innlogget</p>
              </div>
            </div>
            <button
              onClick={onSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-primary-300 hover:text-white hover:bg-primary-900"
            >
              <LogOut className="w-4 h-4" />
              Logg ut
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button
          aria-label="Lukk meny"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-20 bg-primary-950/40 lg:hidden"
        />
      )}

      <div className="lg:pl-72">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-10">
          <button className="lg:hidden p-2 text-gray-600" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="lg:hidden font-bold text-primary-900">Aksell Vaktplan</div>
          <div className="hidden lg:block" />
          <div className="w-8 h-8 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </header>
        <main className="p-4 sm:p-8 max-w-[1440px] mx-auto">{children}</main>
      </div>
    </div>
  );
}

export default App;
