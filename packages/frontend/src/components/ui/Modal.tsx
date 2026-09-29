import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

/** Janela modal padrão (acessível, fecha com Esc e clique fora, funciona no modo escuro). */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50" />
        <Dialog.Content
          className={`fixed z-[81] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] ${SIZES[size]} max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-modal focus:outline-none`}
        >
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="text-sm text-[var(--text-secondary)] mt-0.5">{description}</Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">{title}</Dialog.Description>
                )}
              </div>
              <Dialog.Close asChild>
                <button aria-label="Fechar" className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]">
                  <X size={20} />
                </button>
              </Dialog.Close>
            </div>
            {children}
            {footer && <div className="flex flex-wrap gap-2 justify-end mt-5 pt-4 border-t border-[var(--border-color)]">{footer}</div>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
