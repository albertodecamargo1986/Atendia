import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuthStore, isOwnerOrAdmin } from '../stores/auth';
import { PLAN_LABELS, minimumPlanFor } from '../lib/plans';
import {
  findNavItem, visibleTabs, isModuleLocked, useOpenLocked, type NavTab,
} from '../lib/navigation';
import { SectionContext } from './ui/SectionContext';
import { Button } from './ui/Button';

/** Qual aba corresponde ao endereço atual (a mais específica ganha). */
function currentTab(tabs: NavTab[], pathname: string): NavTab | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  return [...tabs]
    .sort((a, b) => b.to.length - a.to.length)
    .find((t) => path === t.to || path.startsWith(`${t.to}/`));
}

/**
 * Seção com abas (ex.: Agentes de IA → Agentes · Conhecimento · Vozes).
 * As abas são links: o endereço muda, o "voltar" do navegador funciona e dá para
 * mandar o link de uma aba. Abas fora do plano mostram cadeado; abas que o papel
 * não pode ver não aparecem.
 */
export default function SectionLayout({ id }: { id: string }) {
  const { user, tenant, authChecked } = useAuthStore();
  const location = useLocation();
  const openLocked = useOpenLocked();
  const item = findNavItem(id);

  if (!item) return <Outlet />;

  // Sem o papel ainda (carregando /auth/me) não dá para saber quais abas mostrar
  if (!authChecked || !user) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Carregando">
        <div className="w-6 h-6 border-2 border-[var(--color-primary-500)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const role = user.role;
  const allTabs = item.tabs || [];
  const tabs = visibleTabs(item, role);
  const active = currentTab(allTabs, location.pathname);

  // Aba que o papel não pode ver (ex.: supervisor em /team) → primeira aba permitida
  if (active && !tabs.includes(active)) {
    return tabs.length ? <Navigate to={tabs[0].to} replace /> : <Navigate to="/" replace />;
  }

  const activeLocked = !!active && isModuleLocked(tenant?.plan, active.module);
  const planNeeded = active?.module ? PLAN_LABELS[minimumPlanFor(active.module)] || 'Pro' : '';

  return (
    <SectionContext.Provider value={{ embedded: true }}>
      <div>
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{item.label}</h1>
          {item.description && (
            <p className="text-sm text-[var(--text-secondary)] mt-1">{item.description}</p>
          )}
        </header>

        {tabs.length > 1 && (
          <nav
            className="section-tabs flex gap-1 overflow-x-auto overflow-y-hidden mb-5"
            aria-label={`Abas de ${item.label}`}
          >
            {tabs.map((tab) => {
              const locked = isModuleLocked(tenant?.plan, tab.module);
              if (locked) {
                return (
                  <button
                    key={tab.to}
                    type="button"
                    onClick={() => openLocked(tab.label, tab.module)}
                    className={`section-tab ${active === tab ? 'is-active' : ''}`}
                    title={`${tab.label}: disponível no plano ${PLAN_LABELS[minimumPlanFor(tab.module!)]}`}
                    aria-label={`${tab.label} (bloqueado no seu plano)`}
                  >
                    {tab.label}
                    <Lock size={12} className="text-[var(--text-tertiary)]" aria-hidden />
                  </button>
                );
              }
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end
                  className={() => `section-tab ${active === tab ? 'is-active' : ''}`}
                  aria-current={active === tab ? 'page' : undefined}
                >
                  {tab.label}
                </NavLink>
              );
            })}
          </nav>
        )}

        {activeLocked ? (
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-primary)] p-8 text-center">
            <div className="mx-auto w-11 h-11 rounded-full bg-[var(--surface-tertiary)] flex items-center justify-center mb-3">
              <Lock size={20} className="text-[var(--text-secondary)]" />
            </div>
            <p className="font-semibold text-[var(--text-primary)]">{active!.label} não está no seu plano</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {isOwnerOrAdmin(role)
                ? `Disponível a partir do plano ${planNeeded}.`
                : `Disponível a partir do plano ${planNeeded}. Fale com o responsável pela conta.`}
            </p>
            {isOwnerOrAdmin(role) && (
              <Button className="mt-4" onClick={() => openLocked(active!.label, active!.module)}>
                Ver planos
              </Button>
            )}
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </SectionContext.Provider>
  );
}
