import * as Tooltip from '@radix-ui/react-tooltip';
import { HelpCircle } from 'lucide-react';

/** Ícone (?) com explicação curta ao passar o mouse ou tocar. */
export function HelpTip({ text, label = 'Ajuda' }: { text: string; label?: string }) {
  return (
    <Tooltip.Provider delayDuration={100}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--color-primary-500)] align-middle"
          >
            <HelpCircle size={15} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            className="z-[100] max-w-xs rounded-lg bg-[var(--surface-inverse)] px-3 py-2 text-xs leading-relaxed text-[var(--text-inverse)] shadow-dropdown"
          >
            {text}
            <Tooltip.Arrow className="fill-[var(--surface-inverse)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
