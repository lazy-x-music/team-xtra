import { X } from 'lucide-react';
import type React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-gray-200 rounded-2xl shadow-sm ${className}`}>{children}</div>;
}

export function Modal({
  title,
  onClose,
  children,
  maxWidth = 'sm:max-w-lg',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-primary-950/40 p-0 sm:p-4">
      <div className={`bg-white w-full ${maxWidth} rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-auto`}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="font-bold text-primary-950">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-primary-950/30">
      <button className="absolute inset-0" onClick={onClose} aria-label="Lukk" />
      <aside className="absolute right-0 top-0 bottom-0 bg-white w-full sm:max-w-md shadow-2xl overflow-auto">
        <div className="p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-start justify-between">
            <div>
              {subtitle && <p className="text-xs font-bold uppercase tracking-wider text-accent-600">{subtitle}</p>}
              <h2 className="text-xl font-bold text-primary-950 mt-2">{title}</h2>
            </div>
            <button onClick={onClose}>
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        <p className="text-xs font-bold tracking-[0.16em] uppercase text-accent-600 mb-2">{eyebrow}</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary-950">{title}</h1>
        <p className="text-gray-500 mt-2 max-w-2xl">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Notice({
  message,
  error = false,
  onClose,
}: {
  message: string;
  error?: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={`mb-5 rounded-xl px-4 py-3 flex items-center gap-3 text-sm ${
        error ? 'bg-error-50 text-error-700' : 'bg-success-50 text-success-700'
      }`}
    >
      <span className="flex-1">{message}</span>
      <button onClick={onClose}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    open: { label: 'Åpen', cls: 'bg-success-50 text-success-700' },
    fullsatt: { label: 'Fullsatt', cls: 'bg-primary-100 text-primary-700' },
    pending: { label: 'Venter', cls: 'bg-warning-50 text-warning-700' },
    approved: { label: 'Godkjent', cls: 'bg-success-50 text-success-700' },
    waitlist: { label: 'Venteliste', cls: 'bg-warning-50 text-warning-700' },
    rejected: { label: 'Avslått', cls: 'bg-gray-100 text-gray-500' },
    completed: { label: 'Fullført', cls: 'bg-primary-100 text-primary-700' },
  };
  const item = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${item.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {item.label}
    </span>
  );
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="py-14 text-center">
      <p className="font-semibold text-gray-700">{title}</p>
      <p className="text-sm text-gray-400 mt-1">{text}</p>
    </div>
  );
}

export function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-bold text-primary-950">{title}</h2>
      <span className="h-px bg-gray-200 flex-1 ml-4" />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-primary-950 mt-2">{value}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
          {icon}
        </div>
      </div>
    </Card>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <Modal title={title} onClose={onCancel} maxWidth="sm:max-w-md">
      <p className="text-gray-600 mb-6">{message}</p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="button-secondary flex-1">
          Avbryt
        </button>
        <button
          onClick={onConfirm}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors ${
            danger ? 'bg-error-600 hover:bg-error-700' : 'bg-primary-800 hover:bg-primary-700'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
