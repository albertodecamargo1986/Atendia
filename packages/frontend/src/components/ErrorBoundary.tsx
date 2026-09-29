import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Quando muda (ex.: rota atual), a tela de erro é descartada. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Evita tela branca: mostra uma mensagem amigável se algum componente quebrar. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-[var(--surface-primary)] border border-[var(--border-color)] rounded-xl p-8 shadow-card">
          <div className="w-14 h-14 mx-auto rounded-full bg-[var(--color-error-bg)] flex items-center justify-center mb-4">
            <AlertTriangle size={28} className="text-[var(--color-error)]" />
          </div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Ops! Algo deu errado nesta tela.</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Não se preocupe, seus dados estão seguros. Tente recarregar a página.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary-500)] text-white text-sm font-medium hover:bg-[var(--color-primary-600)]"
            >
              <RefreshCw size={16} /> Recarregar
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] text-sm font-medium hover:bg-[var(--surface-tertiary)]"
            >
              <Home size={16} /> Ir para o início
            </button>
          </div>
        </div>
      </div>
    );
  }
}
