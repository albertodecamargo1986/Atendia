import {
  Moon, Sun, LogOut, Menu, X, ChevronLeft, ChevronsUpDown, Lock, MessageSquare, Shield, Rocket, UserCircle,
} from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore, isOwnerOrAdmin } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import { PLAN_LABELS, minimumPlanFor } from '../lib/plans';
import {
  NAV_SECTIONS, canSee, isItemActive, isItemLocked, itemHref, lockedModuleOf, useOpenLocked, type NavItem,
} from '../lib/navigation';
import { useNavBadges } from '../hooks/useNavBadges';

const COLLAPSED_KEY = 'atendia_sidebar_collapsed';

function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}

function initials(name?: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function badgeText(n: number) {
  return n > 99 ? '99+' : String(n);
}

export default function Sidebar() {
  const { user, tenant, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const openLocked = useOpenLocked();
  const badges = useNavBadges();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);

  const role = user?.role;
  const isManager = isOwnerOrAdmin(role);

  const sections = NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => canSee(i.audience, role)) }))
    .filter((s) => s.items.length > 0);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* sem armazenamento */ }
  }, [collapsed]);

  // Gaveta fechada não recebe foco nem leitor de tela; Esc fecha
  useEffect(() => {
    drawerRef.current?.toggleAttribute('inert', !mobileOpen);
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // Mudou de tela → fecha a gaveta do celular
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function renderItem(item: NavItem, isCollapsed: boolean) {
    const { label, icon: Icon } = item;
    const locked = isItemLocked(item, role, tenant?.plan);
    const count = item.badge ? badges[item.badge] : 0;

    const icon = (
      <span className="relative shrink-0 flex">
        <Icon size={18} aria-hidden />
        {isCollapsed && count > 0 && !locked && (
          <span className="nav-badge nav-badge-dot">{badgeText(count)}</span>
        )}
      </span>
    );

    if (locked) {
      const module = lockedModuleOf(item, role);
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => { setMobileOpen(false); openLocked(label, module); }}
          className={`nav-item is-locked ${isCollapsed ? 'justify-center' : ''}`}
          title={`${label}: disponível no plano ${PLAN_LABELS[minimumPlanFor(module || '')]}`}
          aria-label={`${label} (bloqueado no seu plano)`}
        >
          {icon}
          {!isCollapsed && <span className="truncate flex-1">{label}</span>}
          {!isCollapsed && <Lock size={13} className="shrink-0 text-[var(--text-tertiary)]" aria-hidden />}
        </button>
      );
    }

    const active = isItemActive(item, pathname);
    const aria = count > 0 ? `${label} (${count} ${item.badge === 'tickets' ? 'aguardando' : 'não lidas'})` : label;
    return (
      // Link (e não NavLink): o "ativo" é calculado por isItemActive, que também cobre abas e /agents/*
      <Link
        key={item.id}
        to={itemHref(item, role, tenant?.plan)}
        className={`nav-item ${active ? 'is-active' : ''} ${isCollapsed ? 'justify-center' : ''}`}
        aria-current={active ? 'page' : undefined}
        title={isCollapsed ? label : undefined}
        aria-label={isCollapsed || count > 0 ? aria : undefined}
      >
        {icon}
        {!isCollapsed && <span className="truncate flex-1">{label}</span>}
        {!isCollapsed && count > 0 && <span className="nav-badge">{badgeText(count)}</span>}
      </Link>
    );
  }

  function renderNav(isCollapsed: boolean, isMobile: boolean) {
    return (
      <>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--border-color)] shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-500)] flex items-center justify-center shrink-0">
              <MessageSquare size={16} className="text-white" />
            </div>
            {!isCollapsed && (
              <span className="text-base font-bold text-[var(--text-primary)] whitespace-nowrap">AtendIA</span>
            )}
          </div>
          {isMobile ? (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
              className="nav-item !w-9 !p-2 justify-center"
            >
              <X size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
              className={`nav-item !w-7 !p-1 justify-center ${isCollapsed ? 'hidden' : ''}`}
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>

        {/* Empresa e plano */}
        {tenant && !isCollapsed && (
          <div className="px-4 py-2 border-b border-[var(--border-color)]">
            <p className="text-xs text-[var(--text-tertiary)] truncate">{tenant.name}</p>
            <p className="text-[10px] text-[var(--color-primary-500)] uppercase font-semibold">
              Plano {PLAN_LABELS[tenant.plan] || tenant.plan}
            </p>
          </div>
        )}

        {/* Expandir (no modo recolhido o botão fica aqui, logo abaixo do logo) */}
        {isCollapsed && (
          <div className="px-2 pt-2">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expandir menu"
              title="Expandir menu"
              className="nav-item justify-center"
            >
              <ChevronLeft size={16} className="rotate-180" />
            </button>
          </div>
        )}

        {/* Seções */}
        <nav className="flex-1 px-2 pb-2 overflow-y-auto overflow-x-hidden" aria-label="Menu principal">
          {sections.map((section, idx) => (
            <div key={section.title} role="group" aria-label={section.title}>
              {isCollapsed
                ? idx > 0 && <div className="nav-section-divider" aria-hidden />
                : <p className="nav-section-title">{section.title}</p>}
              <div className="space-y-0.5">
                {section.items.map((item) => renderItem(item, isCollapsed))}
              </div>
            </div>
          ))}
        </nav>

        {/* Área do dono da plataforma */}
        {role === 'SUPER_ADMIN' && (
          <div className="px-2 pb-1">
            <NavLink
              to="/admin"
              className={({ isActive }) => `nav-item is-admin ${isActive ? 'is-active' : ''} ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? 'Administração' : undefined}
              aria-label="Administração da plataforma"
            >
              <Shield size={18} className="shrink-0" />
              {!isCollapsed && <span className="truncate">Administração</span>}
            </NavLink>
          </div>
        )}

        {/* Menu do usuário */}
        {user && (
          <div className="border-t border-[var(--border-color)] p-2">
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={`nav-item !py-1.5 ${isCollapsed ? 'justify-center' : ''}`}
                  aria-label={`Menu de ${user.name}`}
                  title={isCollapsed ? user.name : undefined}
                >
                  <span
                    className="w-8 h-8 rounded-full bg-[var(--color-primary-100)] text-[var(--color-primary-700)] flex items-center justify-center text-xs font-semibold shrink-0"
                    aria-hidden
                  >
                    {initials(user.name)}
                  </span>
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-[var(--text-primary)] truncate">{user.name}</span>
                        <span className="block text-xs text-[var(--text-tertiary)] truncate font-normal">{user.email}</span>
                      </span>
                      <ChevronsUpDown size={14} className="shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                    </>
                  )}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="top"
                  align="start"
                  sideOffset={6}
                  className="menu-content z-[70] min-w-[220px] rounded-xl border border-[var(--border-color)] bg-[var(--surface-primary)] p-1 shadow-dropdown"
                >
                  <DropdownMenu.Item className="menu-item" onSelect={() => navigate('/settings')}>
                    <UserCircle size={16} className="text-[var(--text-secondary)]" /> Meu perfil
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className="menu-item" onSelect={toggleTheme}>
                    {theme === 'dark'
                      ? <Sun size={16} className="text-[var(--text-secondary)]" />
                      : <Moon size={16} className="text-[var(--text-secondary)]" />}
                    {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
                  </DropdownMenu.Item>
                  {isManager && (
                    <DropdownMenu.Item className="menu-item" onSelect={() => navigate('/onboarding')}>
                      <Rocket size={16} className="text-[var(--text-secondary)]" /> Assistente de configuração
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className="my-1 h-px bg-[var(--border-color)]" />
                  <DropdownMenu.Item className="menu-item is-danger" onSelect={handleLogout}>
                    <LogOut size={16} /> Sair
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Botão do menu no celular */}
      {!mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="btn-press lg:hidden fixed top-1.5 left-3 z-50 bg-[var(--surface-primary)] border border-[var(--border-color)] text-[var(--text-primary)] p-2 rounded-lg shadow-soft"
        >
          <Menu size={20} />
        </button>
      )}

      <div
        className={`sidebar-overlay lg:hidden fixed inset-0 bg-black/50 z-30 ${mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />

      {/* Menu no celular (gaveta) */}
      <aside
        ref={drawerRef}
        className={`sidebar-drawer lg:hidden fixed inset-y-0 left-0 z-40 w-[min(18rem,85vw)] bg-[var(--surface-primary)] border-r border-[var(--border-color)] flex flex-col ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!mobileOpen}
      >
        {renderNav(false, true)}
      </aside>

      {/* Menu no computador */}
      <aside
        className={`sidebar-desktop hidden lg:flex flex-col shrink-0 bg-[var(--surface-primary)] border-r border-[var(--border-color)] h-screen sticky top-0 overflow-hidden ${
          collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]'
        }`}
      >
        {renderNav(collapsed, false)}
      </aside>
    </>
  );
}
