import { FormEvent, useState } from 'react';
import { CalendarClock, CheckCircle2, Hash, KeyRound, Loader2, Lock, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function AuthScreen() {
  return <LoginScreen />;
}

export function PinOnboarding() {
  const { completePinSetup, signOut } = useAuth();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pin.length !== 4) {
      setError('PIN-koden må være nøyaktig 4 siffer.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN-kodene stemmer ikke overens.');
      return;
    }

    setSubmitting(true);
    const result = await completePinSetup(pin);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-primary-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center gap-2 mb-8 justify-center">
            <CalendarClock className="w-7 h-7 text-accent-400" />
            <span className="text-lg font-semibold tracking-tight text-white">
              Aksell Vaktplan
            </span>
          </div>
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="w-14 h-14 rounded-full bg-success-100 text-success-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-primary-950 mb-2">PIN-kode lagret! Velkommen.</h2>
            <p className="text-sm text-gray-500 mb-6">Du videresendes til vaktplanen din…</p>
            <div className="flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <CalendarClock className="w-7 h-7 text-accent-400" />
          <span className="text-lg font-semibold tracking-tight text-white">
            Aksell Vaktplan
          </span>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-7">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-primary-950">Opprett din personlige PIN-kode</h2>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Dette er første gang du logger inn. Velg en 4-sifret PIN-kode som du vil bruke ved fremtidige innlogginger.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Ny 4-sifret PIN
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  required
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent tracking-widest"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Bekreft PIN
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  required
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent tracking-widest"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-error-600 bg-error-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-primary-800 hover:bg-primary-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Lagre PIN-kode
            </button>
          </form>

          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 mt-4 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logg ut
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const { adminSignIn, workerSignIn } = useAuth();
  const [mode, setMode] = useState<'admin' | 'worker'>('worker');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result =
      mode === 'admin'
        ? await adminSignIn(email, password)
        : await workerSignIn(employeeNumber, pin);

    setSubmitting(false);
    if (result.error) setError(result.error);
  };

  return (
    <div className="min-h-screen bg-primary-950 flex flex-col md:flex-row">
      <div className="hidden md:flex md:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-primary-900 to-primary-950 text-white">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-7 h-7 text-accent-400" />
          <span className="text-lg font-semibold tracking-tight">Aksell Vaktplan</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Vaktplanlegging for Team Xtra
          </h1>
          <p className="text-primary-200 text-lg leading-relaxed max-w-md">
            Opprett vakter, ta imot søknader og godkjenn timer på ett sted — enkelt for Aksell
            og for hver medarbeider.
          </p>
        </div>
        <p className="text-primary-300 text-sm">Aksell Management &middot; Team Xtra</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 md:hidden justify-center">
            <CalendarClock className="w-7 h-7 text-accent-400" />
            <span className="text-lg font-semibold tracking-tight text-white">
              Aksell Vaktplan
            </span>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-7">
            <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
              <button
                type="button"
                onClick={() => { setMode('worker'); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === 'worker' ? 'bg-white shadow text-primary-800' : 'text-gray-500'
                }`}
              >
                <Hash className="w-3.5 h-3.5" /> Ansatt
              </button>
              <button
                type="button"
                onClick={() => { setMode('admin'); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === 'admin' ? 'bg-white shadow text-primary-800' : 'text-gray-500'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Admin
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'admin' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">E-post</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@aksell.no"
                        className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Passord</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Ansattnummer
                    </label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        required
                        value={employeeNumber}
                        onChange={(e) => setEmployeeNumber(e.target.value)}
                        placeholder="f.eks. 104"
                        className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      PIN-kode
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="password"
                        required
                        inputMode="numeric"
                        maxLength={4}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="••••"
                        className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent tracking-widest"
                      />
                    </div>
                  </div>
                </>
              )}

              {error && (
                <p className="text-sm text-error-600 bg-error-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-primary-800 hover:bg-primary-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl transition-colors"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Logg inn
              </button>
            </form>

            {mode === 'worker' && (
              <p className="text-xs text-gray-400 mt-4 text-center leading-relaxed">
                Første gang? Bruk den midlertidige koden du fikk, og du vil bli bedt om å opprette din egen PIN.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
