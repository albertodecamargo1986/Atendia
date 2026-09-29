import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { create } from 'zustand';
import { Button } from './Button';

/**
 * Modal de confirmação próprio (substitui window.confirm).
 *
 * Uso:
 *   if (!(await askConfirm({ title: 'Excluir contato?', danger: true }))) return;
 *
 * O <ConfirmDialogHost/> precisa estar montado uma vez no App.
 */
export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
  show: (options: ConfirmOptions) => Promise<boolean>;
  close: (value: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,
  show: (options) =>
    new Promise<boolean>((resolve) => {
      // Se já havia um aberto, cancela o anterior
      get().resolve?.(false);
      set({ open: true, options, resolve });
    }),
  close: (value) => {
    get().resolve?.(value);
    set({ open: false, resolve: null });
  },
}));

export function askConfirm(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === 'string' ? { title: options } : options;
  return useConfirmStore.getState().show(opts);
}

export function ConfirmDialogHost() {
  const { open, options, close } = useConfirmStore();

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) close(false); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/50 animate-fadeIn" />
        <Dialog.Content
          className="fixed z-[91] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--surface-primary)] p-6 shadow-modal focus:outline-none"
        >
          <div className="flex items-start gap-3">
            {options?.danger && (
              <div className="w-10 h-10 rounded-full bg-[var(--color-error-bg)] flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-[var(--color-error)]" />
              </div>
            )}
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">
                {options?.title}
              </Dialog.Title>
              {options?.description ? (
                <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">
                  {options.description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">Confirme a ação</Dialog.Description>
              )}
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => close(false)}>
              {options?.cancelLabel || 'Cancelar'}
            </Button>
            <Button variant={options?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {options?.confirmLabel || 'Confirmar'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
