import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
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

function mapAuthError(message: string): string {
  if (message.includes('already registered')) return 'Denne e-posten er allerede registrert.';
  if (message.includes('Invalid login credentials')) return 'Feil ansattnummer eller kode.';
  if (message.includes('Password should be at least')) return 'Koden må ha minst 6 tegn.';
  return 'Noe gikk galt. Vennligst prøv igjen.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        setProfile(await fetchProfile(data.session.user.id));
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        if (newSession) {
          setProfile(await fetchProfile(newSession.user.id));
        } else {
          setProfile(null);
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
    // Workers log in with their employee number as a synthetic email
    const email = `ansatt${employeeNumber}@aksell.internal`;
    const { error } = await supabase.auth.signInWithPassword({ email, password: pin });
    if (error) return { error: mapAuthError(error.message) };
    return { error: null };
  };

  const completePinSetup: AuthContextValue['completePinSetup'] = async (pin) => {
    // 1. Store the PIN hash in the database and mark setup_complete.
    //    This is the only blocking step — once it succeeds, the worker
    //    is considered onboarded and can proceed to the dashboard.
    const { error: rpcError } = await supabase.rpc('complete_pin_setup', { p_pin: pin });
    if (rpcError) {
      console.error('complete_pin_setup RPC failed:', rpcError.message, rpcError.code, rpcError.details);
      return { error: 'Kunne ikke lagre PIN-koden. Vennligst prøv igjen, eller kontakt administratoren.' };
    }

    // 2. Update the local profile immediately so the app routes to the
    //    dashboard without waiting for any additional API calls.
    if (session) {
      setProfile(await fetchProfile(session.user.id));
    }

    // 3. Fire-and-forget: update the Supabase auth password via edge
    //    function (admin API bypasses the client-side 6-char minimum).
    //    If this fails, the worker's DB PIN is already set — the admin
    //    can reset it. We don't block the redirect on this.
    supabase.functions.invoke('update-worker-pin', { body: { pin } })
      .then(({ error }) => {
        if (error) console.error('update-worker-pin edge function failed:', error.message);
      });

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
