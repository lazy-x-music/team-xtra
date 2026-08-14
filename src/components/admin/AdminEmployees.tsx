import { useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, RotateCcw, UserPlus, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';
import { employeeLabel } from '@/utils/shiftHelpers';
import {
  Card,
  ConfirmDialog,
  Empty,
  Field,
  Metric,
  Modal,
  Notice,
  PageHeader,
} from '@/components/ui';

export function AdminEmployees({
  refresh,
  onRefresh,
}: {
  refresh: number;
  onRefresh: () => void;
}) {
  const [workers, setWorkers] = useState<Profile[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    load();
  }, [refresh]);

  async function load() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, employee_number, setup_complete, created_at')
      .eq('role', 'worker')
      .order('employee_number', { ascending: true });
    setWorkers((data || []) as Profile[]);
  }

  async function createEmployee(employeeNumber: number, setupCode: string) {
    const { error } = await supabase.functions.invoke('create-employee', {
      body: { employee_number: employeeNumber, setup_code: setupCode },
    });

    if (error) {
      const body = await error.context.json().catch(() => ({}));
      setNotice({ message: body.error || 'Kunne ikke opprette ansatt.', error: true });
      return false;
    }

    setNotice({
      message: `Ansatt #${employeeNumber} opprettet. Midlertidig kode: ${setupCode || '0000'}`,
    });
    setShowCreate(false);
    load();
    onRefresh();
    return true;
  }

  async function resetPin(worker: Profile) {
    const { error } = await supabase.functions.invoke('reset-pin', {
      body: { employee_number: worker.employee_number },
    });

    if (error) {
      const body = await error.context.json().catch(() => ({}));
      setNotice({ message: body.error || 'Kunne ikke nullstille PIN.', error: true });
      return;
    }

    setNotice({
      message: `PIN nullstilt for ${employeeLabel(worker.employee_number)}. Midlertidig kode: 0000`,
    });
    setResetTarget(null);
    load();
    onRefresh();
  }

  const pendingSetup = workers.filter((w) => !w.setup_complete).length;

  return (
    <>
      <PageHeader
        eyebrow="Administrasjon"
        title="Ansattoversikt"
        description="Opprett ansatte med ansattnummer, og nullstill PIN-koder ved behov. Alt spores kun via ansattnummer — ingen personopplysninger lagres."
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center justify-center gap-2 bg-primary-800 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Opprett ansatt
          </button>
        }
      />

      {notice && <Notice {...notice} onClose={() => setNotice(null)} />}

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <Metric label="Totalt ansatte" value={workers.length} icon={<Users className="w-5 h-5" />} />
        <Metric label="Aktive (PIN satt)" value={workers.filter((w) => w.setup_complete).length} icon={<KeyRound className="w-5 h-5" />} />
        <Metric label="Venter på oppsett" value={pendingSetup} icon={<UserPlus className="w-5 h-5" />} />
      </div>

      <Card>
        {workers.length === 0 ? (
          <Empty title="Ingen ansatte ennå" text="Opprett den første ansatte ved å klikke 'Opprett ansatt'." />
        ) : (
          workers.map((worker) => (
            <div
              key={worker.id}
              className="p-5 border-b border-gray-100 last:border-0 flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                #{worker.employee_number}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-primary-950">
                  {employeeLabel(worker.employee_number)}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {worker.setup_complete ? (
                    <span className="text-xs font-semibold text-success-700 bg-success-50 px-2 py-0.5 rounded-full">
                      PIN aktiv
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-warning-700 bg-warning-50 px-2 py-0.5 rounded-full">
                      Venter på PIN-oppsett
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setResetTarget(worker)}
                className="flex items-center gap-1.5 text-xs font-semibold text-error-600 hover:text-error-700 border border-error-200 hover:bg-error-50 px-3 py-2 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Nullstill PIN
              </button>
            </div>
          ))
        )}
      </Card>

      {showCreate && (
        <CreateEmployeeModal
          onClose={() => setShowCreate(false)}
          onCreate={createEmployee}
        />
      )}

      {resetTarget && (
        <ConfirmDialog
          title="Nullstill PIN"
          message={`Er du sikker på at du vil nullstille PIN-koden for ${employeeLabel(resetTarget.employee_number)}? Den ansatte må bruke den midlertidige koden (0000) ved neste innlogging og opprette en ny PIN.`}
          confirmLabel="Nullstill PIN"
          danger
          onConfirm={() => resetPin(resetTarget)}
          onCancel={() => setResetTarget(null)}
        />
      )}
    </>
  );
}

function CreateEmployeeModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (employeeNumber: number, setupCode: string) => Promise<boolean>;
}) {
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [setupCode, setSetupCode] = useState('0000');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onCreate(Number(employeeNumber), setupCode);
    setSubmitting(false);
  }

  return (
    <Modal title="Opprett ny ansatt" onClose={onClose} maxWidth="sm:max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Ansattnummer">
          <input
            type="number"
            required
            min="1"
            value={employeeNumber}
            onChange={(e) => setEmployeeNumber(e.target.value)}
            placeholder="f.eks. 104"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </Field>
        <Field label="Midlertidig kode">
          <input
            type="text"
            required
            maxLength={4}
            value={setupCode}
            onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="0000"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent tracking-widest"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            Standard er 0000. Den ansatte bruker denne koden ved første innlogging og oppretter deretter sin egen PIN.
          </p>
        </Field>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="button-secondary flex-1">
            Avbryt
          </button>
          <button
            type="submit"
            disabled={submitting || !employeeNumber}
            className="button-primary flex-1 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Opprett
          </button>
        </div>
      </form>
    </Modal>
  );
}
