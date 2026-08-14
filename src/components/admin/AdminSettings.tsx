import { useEffect, useState } from 'react';
import { KeyRound, Loader2, Mail, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card,
  ConfirmDialog,
  Empty,
  Field,
  Modal,
  Notice,
  PageHeader,
} from '@/components/ui';

interface AdminAccount {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
}

export function AdminSettings({ refresh }: { refresh: number }) {
  const { session } = useAuth();
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    load();
  }, [refresh]);

  async function load() {
    const { data, error } = await supabase.functions.invoke('manage-admins', {
      body: { action: 'list' },
    });

    if (error || data?.error) {
      setNotice({ message: data?.error || 'Kunne ikke hente administratorer.', error: true });
      return;
    }

    setAdmins(data.admins || []);
  }

  async function createAdmin(email: string, password: string, fullName: string) {
    const { data, error } = await supabase.functions.invoke('manage-admins', {
      body: { action: 'create', email, password, full_name: fullName },
    });

    if (error || data?.error) {
      setNotice({ message: data?.error || 'Kunne ikke opprette admin.', error: true });
      return false;
    }

    setNotice({ message: `Admin opprettet: ${email}` });
    setShowCreate(false);
    load();
    return true;
  }

  async function updateAdmin(userId: string, password: string, fullName: string) {
    const { data, error } = await supabase.functions.invoke('manage-admins', {
      body: { action: 'update', user_id: userId, password: password || undefined, full_name: fullName },
    });

    if (error || data?.error) {
      setNotice({ message: data?.error || 'Kunne ikke oppdatere admin.', error: true });
      return;
    }

    setNotice({ message: 'Admin oppdatert.' });
    setEditTarget(null);
    load();
  }

  async function deleteAdmin(userId: string) {
    const { data, error } = await supabase.functions.invoke('manage-admins', {
      body: { action: 'delete', user_id: userId },
    });

    if (error || data?.error) {
      setNotice({ message: data?.error || 'Kunne ikke slette admin.', error: true });
      return;
    }

    setNotice({ message: 'Admin slettet.' });
    setDeleteTarget(null);
    load();
  }

  const currentUserId = session?.user?.id;

  return (
    <>
      <PageHeader
        eyebrow="Administrasjon"
        title="Administrer Admins"
        description="Legg til, rediger eller fjern administratorer. En admin kan ikke slette sin egen konto."
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center justify-center gap-2 bg-primary-800 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Legg til admin
          </button>
        }
      />

      {notice && <Notice {...notice} onClose={() => setNotice(null)} />}

      <Card>
        {admins.length === 0 ? (
          <Empty title="Ingen administratorer" text="Legg til den første administratoren." />
        ) : (
          admins.map((admin) => (
            <div
              key={admin.id}
              className="p-5 border-b border-gray-100 last:border-0 flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-primary-950">
                  {admin.full_name || admin.email}
                  {admin.id === currentUserId && (
                    <span className="ml-2 text-xs font-semibold text-accent-700 bg-accent-50 px-2 py-0.5 rounded-full">
                      Deg
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-500 truncate">{admin.email}</p>
              </div>
              <button
                onClick={() => setEditTarget(admin)}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 border border-primary-200 hover:bg-primary-50 px-3 py-2 rounded-lg transition-colors"
              >
                <UserCog className="w-3.5 h-3.5" />
                Rediger
              </button>
              <button
                onClick={() => setDeleteTarget(admin)}
                disabled={admin.id === currentUserId}
                className="flex items-center gap-1.5 text-xs font-semibold text-error-600 hover:text-error-700 border border-error-200 hover:bg-error-50 px-3 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Slett
              </button>
            </div>
          ))
        )}
      </Card>

      {showCreate && (
        <CreateAdminModal onClose={() => setShowCreate(false)} onCreate={createAdmin} />
      )}

      {editTarget && (
        <EditAdminModal
          admin={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={updateAdmin}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Slett admin"
          message={`Er du sikker på at du vil slette administratoren "${deleteTarget.full_name || deleteTarget.email}"? Dette kan ikke angres.`}
          confirmLabel="Slett admin"
          danger
          onConfirm={() => deleteAdmin(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

function CreateAdminModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (email: string, password: string, fullName: string) => Promise<boolean>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onCreate(email, password, fullName);
    setSubmitting(false);
  }

  return (
    <Modal title="Legg til ny admin" onClose={onClose} maxWidth="sm:max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Navn (valgfritt)">
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Admin navn"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </Field>
        <Field label="E-post">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@aksell.no"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </Field>
        <Field label="Passord">
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minst 6 tegn"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </Field>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="button-secondary flex-1">
            Avbryt
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="button-primary flex-1 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Opprett admin
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditAdminModal({
  admin,
  onClose,
  onSave,
}: {
  admin: AdminAccount;
  onClose: () => void;
  onSave: (userId: string, password: string, fullName: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(admin.full_name || '');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSave(admin.id, password, fullName);
    setSubmitting(false);
  }

  return (
    <Modal title="Rediger admin" onClose={onClose} maxWidth="sm:max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center">
            <Mail className="w-4 h-4" />
          </div>
          <p className="text-sm font-medium text-gray-600">{admin.email}</p>
        </div>
        <Field label="Navn">
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Admin navn"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </Field>
        <Field label="Nytt passord (la stå tomt for å beholde)">
          <input
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </Field>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="button-secondary flex-1">
            Avbryt
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="button-primary flex-1 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Lagre
          </button>
        </div>
      </form>
    </Modal>
  );
}
