import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Search } from 'lucide-react';
import Sidebar from './Sidebar';
import CommandPalette, { openCommandPalette, isMacPlatform } from './CommandPalette';
import { useThemeStore } from '../stores/theme';
import { useAuthStore, isOwnerOrAdmin } from '../stores/auth';
import { useSocketConnected } from '../hooks/useSocket';

import { ONBOARDING_DISMISSED_KEY } from '../lib/onboarding';

/** Indicador pequeno do tempo real (Socket.IO). */
export function RealtimeIndicator({ className = '' }: { className?: string }) {
  const connected = useSocketConnected();
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] ${className}`}
      title={connected ? 'Mensagens novas aparecem na hora' : 'Tentando reconectar... as telas podem demorar a atualizar'}
      role="status"
      aria-live="polite"
    >
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)] animate-pulse'}`} />
      {connected ? 'Tempo real conectado' : 'Tempo real desconectado'}
    </span>
  );
}

export default function Layout() {
  const { theme } = useThemeStore();
  const { user, tenant, authChecked } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Primeiro acesso do dono/administrador: abre o assistente de configuração
  const shouldOnboard =
    authChecked &&
    isOwnerOrAdmin(user?.role) &&
    tenant?.onboardingCompletedAt === null &&
    sessionStorage.getItem(ONBOARDING_DISMISSED_KEY) !== '1';

  if (shouldOnboard && location.pathname === '/') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="flex min-h-screen bg-[var(--surface-secondary)] text-[var(--text-primary)]">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <div className="h-12 lg:h-12 flex items-center justify-between gap-3 pl-16 pr-4 lg:px-6 border-b border-[var(--border-color)] bg-[var(--surface-primary)] lg:bg-transparent lg:border-b-0">
          <button
            type="button"
            onClick={openCommandPalette}
            className="search-trigger flex items-center gap-2 h-9 min-w-0 w-full max-w-[18rem] px-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm text-[var(--text-tertiary)]"
            aria-label="Buscar uma tela ou ação"
            aria-keyshortcuts={isMacPlatform() ? 'Meta+K' : 'Control+K'}
          >
            <Search size={15} className="shrink-0" aria-hidden />
            <span className="flex-1 text-left truncate">Buscar…</span>
            <kbd className="hidden sm:inline text-[10px] font-medium border border-[var(--border-color)] rounded px-1.5 py-0.5">
              {isMacPlatform() ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
          <RealtimeIndicator className="shrink-0" />
        </div>
        <div className="p-4 lg:p-6 lg:pt-2 max-w-7xl mx-auto animate-fadeIn">
          <Outlet />
        </div>
      </main>
      <CommandPalette />
    </div>
  );
}
