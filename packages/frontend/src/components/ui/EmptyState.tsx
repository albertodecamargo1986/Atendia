import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ComponentType<any>;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  children?: ReactNode;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-[var(--surface-tertiary)] flex items-center justify-center mb-4">
        <Icon size={28} className="text-[var(--text-tertiary)]" />
      </div>
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--text-secondary)] max-w-sm">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
}