import {
  Moon, Sun, LogOut, CreditCard, Zap, Menu, X, ChevronLeft, ArrowUpCircle, Lock, type LucideIcon,
  BarChart3, Headphones, Bot, MessageSquare, Contact, Layers, Tag,
  Megaphone, Mic, FileBarChart, MessageCircle, BookOpen,
  Smartphone, Clock, Users, Settings, Shield, Plug, Rocket,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore, isOwnerOrAdmin } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import { useState } from 'react';
import { hasModule, minimumPlanFor, PLAN_LABELS } from '../lib/plans';

type Audience = 'all' | 'supervisor' | 'manager';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  audience: Audience;
  /** módulo do plano (config/plans.ts do backend) */
  module?: string;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Painel', icon: BarChart3, audience: 'all', module: 'dashboard' },
  { to: '/tickets', label: 'Atendimentos', icon: Headphones, audience: 'all', module: 'tickets' },
  { to: '/conversations', label: 'Conversas', icon: MessageSquare, audience: 'all', module: 'conversations' },
  { to: '/contacts', label: 'Contatos', icon: Contact, audience: 'all', module: 'contacts' },
  { to: '/quick-replies', label: 'Respostas Rápidas', icon: Zap, audience: 'all', module: 'quickReplies' },
  { to: '/internal-chat', label: 'Chat Interno', icon: MessageCircle, audience: 'all', module: 'internalChat' },
  { to: '/reports', label: 'Relatórios', icon: FileBarChart, audience: 'supervisor', module: 'reports' },
  { to: '/queues', label: 'Filas', icon: Layers, audience: 'supervisor', module: 'queues' },
  { to: '/agents', label: 'Agentes de IA', icon: Bot, audience: 'manager', module: 'agents' },
  { to: '/knowledge', label: 'Conhecimento', icon: BookOpen, audience: 'manager', module: 'knowledge' },
  { to: '/whatsapp', label: 'WhatsApp', icon: Smartphone, audience: 'manager', module: 'whatsapp' },
  { to: '/business-hours', label: 'Horários', icon: Clock, audience: 'manager', module: 'businessHours' },
  { to: '/tags', label: 'Etiquetas', icon: Tag, audience: 'manager', module: 'tags' },
  { to: '/campaigns', label: 'Campanhas', icon: Megaphone, audience: 'manager', module: 'campaigns' },
  { to: '/voice-profiles', label: 'Vozes', icon: Mic, audience: 'manager', module: 'voiceProfiles' },
  { to: '/integrations', label: 'Integrações', icon: Plug, audience: 'manager', module: 'webhooks' },
  { to: '/team', label: 'Equipe', icon: Users, audience: 'manager', module: 'team' },
  { to: '/subscription', label: 'Assinatura', icon: CreditCard, audience: 'manager' },
  { to: '/upgrade', label: 'Mudar plano', icon: ArrowUpCircle, audience: 'manager' },
  { to: '/settings', label: 'Configurações', icon: Settings, audience: 'all' },
];

function canSee(audience: Audience, role?: string) {
  if (audience === 'all') return true;
  if (audience === 'supervisor') return role === 'SUPERVISOR' || isOwnerOrAdmin(role);
  return isOwnerOrAdmin(role);
}

export default function Sidebar() {
  const { user, tenant, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isManager = isOwnerOrAdmin(user?.role);
  const items = navItems.filter((item) => canSee(item.audience, user?.role));

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function openLocked(item: NavItem) {
    const planNeeded = PLAN_LABELS[minimumPlanFor(item.module!)] || 'Pro';
    setMobileOpen(false);
    if (isManager) {
      toast.info(`${item.label}: disponível no plano ${planNeeded}.`);
      navigate('/upgrade', { state: { lockedFeature: item.label, planNeeded } });
    } else {
      toast.info(`${item.label} está disponível no plano ${planNeeded}. Fale com o responsável pela conta.`);
    }
  }

  const itemClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 w-full ${
      active
        ? 'bg-[var(--color-primary-500)] text-white shadow-sm'
        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] hover:text-[var(--text-primary)]'
    } ${collapsed ? 'justify-center' : ''}`;

  const nav = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--border-color)] shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-500)] flex items-center justify-center shrink-0">
            <MessageSquare size={16} className="text-white" />
          </div>
          {!collapsed && (
            <span className="text-base font-bold text-[var(--text-primary)] whitespace-nowrap">AtendIA</span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="hidden lg:flex items-center justify-center w-6 h-6 rounded-md hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] transition"
        >
          <ChevronLeft size={14} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Empresa e plano */}
      {tenant && !collapsed && (
        <div className="px-4 py-2 border-b border-[var(--border-color)]">
          <p className="text-xs text-[var(--text-tertiary)] truncate">{tenant.name}</p>
          <p className="text-[10px] text-[var(--color-primary-500)] uppercase font-semibold">
            Plano {PLAN_LABELS[tenant.plan] || tenant.plan}
          </p>
        </div>
      )}

      {/* Itens */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto" aria-label="Menu principal">
        {items.map((item) => {
          const { to, label, icon: Icon } = item;
          const locked = !!item.module && !hasModule(tenant?.plan, item.module);
          if (locked) {
            return (
              <button
                key={to}
                type="button"
                onClick={() => openLocked(item)}
                className={`${itemClass(false)} opacity-70`}
                title={`${label} — disponível no plano ${PLAN_LABELS[minimumPlanFor(item.module!)]}`}
                aria-label={`${label} (bloqueado no seu plano)`}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="truncate flex-1 text-left">{label}</span>}
                {!collapsed && <Lock size={13} className="shrink-0 text-[var(--text-tertiary)]" />}
              </button>
            );
          }
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => itemClass(isActive)}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Área do dono da plataforma */}
      {user?.role === 'SUPER_ADMIN' && (
        <div className="px-2 py-1">
          <NavLink
            to="/admin"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] hover:text-purple-500'
              } ${collapsed ? 'justify-center' : ''}`
            }
            aria-label="Administração da plataforma"
          >
            <Shield size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">Administração</span>}
          </NavLink>
        </div>
      )}

      {/* Rodapé */}
      <div className="border-t border-[var(--border-color)] p-2 space-y-0.5">
        {user && !collapsed && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.name}</p>
            <p className="text-xs text-[var(--text-tertiary)] truncate">{user.email}</p>
          </div>
        )}

        <button
          onClick={toggleTheme}
          className={itemClass(false)}
          title="Alternar tema"
          aria-label={theme === 'dark' ? 'Usar modo claro' : 'Usar modo escuro'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {!collapsed && <span>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>}
        </button>

        {isManager && (
          <button
            onClick={() => { setMobileOpen(false); navigate('/onboarding'); }}
            className={itemClass(false)}
            title="Assistente de configuração"
            aria-label="Abrir assistente de configuração"
          >
            <Rocket size={18} />
            {!collapsed && <span>Assistente de configuração</span>}
          </button>
        )}

        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--color-error-bg)] hover:text-[var(--color-error)] transition w-full ${collapsed ? 'justify-center' : ''}`}
          title="Sair"
          aria-label="Sair"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Botão do menu no celular */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
        className="lg:hidden fixed top-1.5 left-3 z-50 bg-[var(--surface-primary)] border border-[var(--border-color)] text-[var(--text-primary)] p-2 rounded-lg shadow-soft"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setMobileOpen(false)} />
      )}

      {/* Menu no celular */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-40 w-64 bg-[var(--surface-primary)] border-r border-[var(--border-color)] flex flex-col transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {nav}
      </aside>

      {/* Menu no computador */}
      <aside
        className={`hidden lg:flex flex-col bg-[var(--surface-primary)] border-r border-[var(--border-color)] h-screen sticky top-0 transition-all duration-300 ${
          collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]'
        }`}
      >
        {nav}
      </aside>
    </>
  );
}
