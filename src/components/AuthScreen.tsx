import { FormEvent, useState } from 'react';
import { CalendarClock, Loader2, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result =
      mode === 'login' ? await signIn(email, password) : await signUp(email, password, fullName);
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
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === 'login' ? 'bg-white shadow text-primary-800' : 'text-gray-500'
                }`}
              >
                Logg inn
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === 'signup' ? 'bg-white shadow text-primary-800' : 'text-gray-500'
                }`}
              >
                Registrer deg
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Fullt navn
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ola Nordmann"
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">E-post</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="navn@aksell.no"
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

              {error && (
                <p className="text-sm text-error-600 bg-error-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-primary-800 hover:bg-primary-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl transition-colors"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === 'login' ? 'Logg inn' : 'Registrer deg'}
              </button>
            </form>

            {mode === 'signup' && (
              <p className="text-xs text-gray-400 mt-4 text-center leading-relaxed">
                Den første som registrerer seg blir Admin. Alle andre registreres som Team Xtra-medarbeider.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
