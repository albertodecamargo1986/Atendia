import type { ReactNode } from 'react';
import { useSectionEmbedded } from './SectionContext';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

/**
 * Cabeçalho padrão das páginas.
 * Dentro de uma seção com abas o título não se repete: fica só a frase de ajuda e os botões.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  const embedded = useSectionEmbedded();

  if (embedded) {
    if (!description && !actions) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        {description ? (
          <p className="text-sm text-[var(--text-secondary)] min-w-0 flex-1">{description}</p>
        ) : <span className="flex-1" />}
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{title}</h1>
        {description && (
          <p className="text-sm text-[var(--text-secondary)] mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
