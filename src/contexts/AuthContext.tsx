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
    const email = `ansatt${employeeNumber}@aksell.internal`;

    // 1. Prøv først med innskrevet PIN som passord i Supabase Auth
    let { error } = await supabase.auth.signInWithPassword({ email, password: pin });

    // 2. Hvis feil (f.eks. ny PIN i DB, men Auth har gammel 0000), prøv med fallback 0000 for å slippe gjennom til tilbakestilling
    if (error) {
      const fallback = await supabase.auth.signInWithPassword({ email, password: '0000' });
      if (!fallback.error) {
        // Hvis innlogging med 0000 overstyrer, oppdaterer vi auth-passordet umiddelbart til den nye PIN-en!
        await supabase.auth.updateUser({ password: pin });
        error = null;
      }
    }

    if (error) return { error: mapAuthError(error.message) };
    return { error: null };
  };

  const completePinSetup: AuthContextValue['completePinSetup'] = async (pin) => {
    // 1. Lagre PIN i databasen via RPC
    const { error: rpcError } = await supabase.rpc('complete_pin_setup', { p_pin: pin });
    if (rpcError) {
      console.error('complete_pin_setup RPC failed:', rpcError.message);
      return { error: 'Kunne ikke lagre PIN-koden. Vennligst prøv igjen.' };
    }

    // 2. Tving oppdatering av passordet direkte på den innloggede Supabase Auth-brukeren!
    const { error: updateError } = await supabase.auth.updateUser({ password: pin });
    if (updateError) {
      console.error('Kunne ikke oppdatere auth passord:', updateError.message);
    }

    // 3. Oppdater lokal profil
    if (session) {
      setProfile(await fetchProfile(session.user.id));
    }

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
