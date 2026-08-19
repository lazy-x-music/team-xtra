import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  adminSignIn: (email: string, password: string) => Promise<{ error: string | null }>;
  workerSignIn: (employeeNumber: string, pin: string) => Promise<{ error: string | null }>;
  completePinSetup: (pin: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const WORKER_SESSION_KEY = 'aksell_worker_session';

interface WorkerSession {
  profile: Profile;
  pin_hash: string | null;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, employee_number, setup_complete, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('fetchProfile failed', error);
    return null;
  }
  return data as Profile | null;
}

function getStoredWorkerSession(): WorkerSession | null {
  try {
    const raw = localStorage.getItem(WORKER_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkerSession;
  } catch {
    return null;
  }
}

function storeWorkerSession(ws: WorkerSession | null) {
  if (ws) {
    localStorage.setItem(WORKER_SESSION_KEY, JSON.stringify(ws));
  } else {
    localStorage.removeItem(WORKER_SESSION_KEY);
  }
}

function mapAuthError(message: string): string {
  if (message.includes('already registered')) return 'Denne e-posten er allerede registrert.';
  if (message.includes('Invalid login credentials')) return 'Feil e-post eller passord.';
  if (message.includes('Password should be at least')) return 'Passordet må ha minst 6 tegn.';
  return 'Noe gikk galt. Vennligst prøv igjen.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setSession(data.session);
        setProfile(await fetchProfile(data.session.user.id));
      } else {
        const ws = getStoredWorkerSession();
        if (ws) setProfile(ws.profile);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        if (newSession) {
          setProfile(await fetchProfile(newSession.user.id));
        } else {
          const ws = getStoredWorkerSession();
          setProfile(ws ? ws.profile : null);
        }
        setLoading(false);
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const adminSignIn: AuthContextValue['adminSignIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: mapAuthError(error.message) };
    return { error: null };
  };

  const workerSignIn: AuthContextValue['workerSignIn'] = async (employeeNumber, pin) => {
    const num = parseInt(employeeNumber, 10);
    if (isNaN(num)) return { error: 'Ugyldig ansattnummer.' };

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, employee_number, setup_complete, created_at, pin_hash')
      .eq('employee_number', num)
      .eq('role', 'worker')
      .maybeSingle();

    if (error || !data) {
      return { error: 'Feil ansattnummer eller kode.' };
    }

    const storedHash = data.pin_hash as string | null;

    if (!data.setup_complete) {
      // Before setup: check against temp code stored in pin_hash
      if (storedHash && bcrypt.compareSync(pin, storedHash)) {
        const workerProfile: Profile = {
          id: data.id, full_name: data.full_name, role: data.role,
          employee_number: data.employee_number, setup_complete: data.setup_complete,
          created_at: data.created_at,
        };
        storeWorkerSession({ profile: workerProfile, pin_hash: storedHash });
        setProfile(workerProfile);
        return { error: null };
      }
      if (!storedHash && pin === '0000') {
        const workerProfile: Profile = {
          id: data.id, full_name: data.full_name, role: data.role,
          employee_number: data.employee_number, setup_complete: data.setup_complete,
          created_at: data.created_at,
        };
        storeWorkerSession({ profile: workerProfile, pin_hash: null });
        setProfile(workerProfile);
        return { error: null };
      }
      return { error: 'Feil ansattnummer eller kode.' };
    }

    // After setup: verify PIN against bcrypt hash
    if (!storedHash || !bcrypt.compareSync(pin, storedHash)) {
      return { error: 'Feil ansattnummer eller kode.' };
    }

    const workerProfile: Profile = {
      id: data.id, full_name: data.full_name, role: data.role,
      employee_number: data.employee_number, setup_complete: data.setup_complete,
      created_at: data.created_at,
    };
    storeWorkerSession({ profile: workerProfile, pin_hash: storedHash });
    setProfile(workerProfile);
    return { error: null };
  };

  const completePinSetup: AuthContextValue['completePinSetup'] = async (pin) => {
    if (!profile) return { error: 'Ingen innlogget bruker.' };
    if (!/^\d{4}$/.test(pin)) return { error: 'PIN må være 4 siffer.' };

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(pin, salt);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ pin_hash: newHash, setup_complete: true })
      .eq('id', profile.id);

    if (updateError) {
      console.error('Failed to update PIN:', updateError.message);
      return { error: 'Kunne ikke lagre PIN-koden. Prøv igjen.' };
    }

    const updatedProfile: Profile = { ...profile, setup_complete: true };
    setProfile(updatedProfile);
    storeWorkerSession({ profile: updatedProfile, pin_hash: newHash });
    return { error: null };
  };

  const signOut: AuthContextValue['signOut'] = async () => {
    storeWorkerSession(null);
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, adminSignIn, workerSignIn, completePinSetup, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
