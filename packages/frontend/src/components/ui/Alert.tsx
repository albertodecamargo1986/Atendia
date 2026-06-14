import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

const config: Record<AlertVariant, { icon: React.ComponentType<any>; bg: string; border: string; text: string; iconColor: string }> = {
  info: { icon: Info, bg: 'bg-[var(--color-info-bg)]', border: 'border-[var(--color-info-border)]', text: 'text-[var(--color-info)]', iconColor: 'text-[var(--color-info)]' },
  success: { icon: CheckCircle2, bg: 'bg-[var(--color-success-bg)]', border: 'border-[var(--color-success-border)]', text: 'text-[var(--color-success)]', iconColor: 'text-[var(--color-success)]' },
  warning: { icon: AlertTriangle, bg: 'bg-[var(--color-warning-bg)]', border: 'border-[var(--color-warning-border)]', text: 'text-[var(--color-warning)]', iconColor: 'text-[var(--color-warning)]' },
  error: { icon: AlertCircle, bg: 'bg-[var(--color-error-bg)]', border: 'border-[var(--color-error-border)]', text: 'text-[var(--color-error)]', iconColor: 'text-[var(--color-error)]' },
};

export function Alert({ variant = 'info', title, children, onClose, className = '' }: AlertProps) {
  const { icon: Icon, bg, border, text, iconColor } = config[variant];

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${bg} ${border} ${className}`}>
      <Icon size={18} className={`mt-0.5 shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        {title && <p className={`text-sm font-semibold ${text}`}>{title}</p>}
        <p className="text-sm text-[var(--text-secondary)]">{children}</p>
      </div>
      {onClose && (
        <button onClick={onClose} className="p-1 rounded hover:bg-black/5 transition">
          <X size={14} className="text-[var(--text-tertiary)]" />
        </button>
      )}
    </div>
  );
}