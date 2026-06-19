import {
  Moon, Sun, LogOut, Zap, Menu, X, ChevronLeft, type LucideIcon,
  BarChart3, Ticket, Bot, MessageSquare, Contact, Layers, Tag,
  Megaphone, Mic, FileBarChart, MessageCircle, BookOpen,
  Smartphone, Clock, Users, Key, Settings, Shield,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import { useState } from 'react';

const navItems: { to: string; label: string; icon: LucideIcon; roles: string[] | null }[] = [
  { to: '/', label: 'Dashboard', icon: BarChart3, roles: null },
  { to: '/tickets', label: 'Tickets', icon: Ticket, roles: null },
  { to: '/agents', label: 'Agentes', icon: Bot, roles: null },
  { to: '/conversations', label: 'Conversas', icon: MessageSquare, roles: null },
  { to: '/contacts', label: 'Contatos', icon: Contact, roles: null },
  { to: '/queues', label: 'Filas', icon: Layers, roles: null },
  { to: '/tags', label: 'Tags', icon: Tag, roles: null },
  { to: '/quick-replies', label: 'Respostas Rápidas', icon: Zap, roles: null },
  { to: '/campaigns', label: 'Campanhas', icon: Megaphone, roles: null },
  { to: '/voice-profiles', label: 'Vozes', icon: Mic, roles: null },
  { to: '/reports', label: 'Relatórios', icon: FileBarChart, roles: null },
  { to: '/internal-chat', label: 'Chat Interno', icon: MessageCircle, roles: null },
  { to: '/knowledge', label: 'Conhecimento', icon: BookOpen, roles: null },
  { to: '/whatsapp', label: 'WhatsApp', icon: Smartphone, roles: null },
  { to: '/business-hours', label: 'Horários', icon: Clock, roles: null },
  { to: '/team', label: 'Equipe', icon: Users, roles: ['OWNER', 'ADMIN'] },
  { to: '/license', label: 'Licença', icon: Key, roles: null },
  { to: '/settings', label: 'Configurações', icon: Settings, roles: null },
];

export default function Sidebar() {
  const { user, tenant, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredItems = navItems.filter(
    (item) => !item.roles || (user?.role && item.roles.includes(user.role))
  );

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function SidebarIcon({ icon: Icon }: { icon: LucideIcon }) {
    return <Icon size={18} className="shrink-0" />;
  }

  const nav = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--border-color)] shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-500)] flex items-center justify-center shrink-0">
            <MessageSquare size={16} className="text-white" />
          </div>
          {!collapsed && (
            <span className="text-base font-bold text-[var(--text-primary)] whitespace-nowrap">
              AtendIA
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center w-6 h-6 rounded-md hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] transition"
        >
          <ChevronLeft size={14} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Tenant name */}
      {tenant && !collapsed && (
        <div className="px-4 py-2 border-b border-[var(--border-color)]">
          <p className="text-xs text-[var(--text-tertiary)] truncate">{tenant.name}</p>
          <p className="text-[10px] text-[var(--color-primary-500)] uppercase font-semibold">{tenant.plan}</p>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {filteredItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[var(--color-primary-500)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] hover:text-[var(--text-primary)]'
                } ${collapsed ? 'justify-center' : ''}`
              }
              title={collapsed ? label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
      </nav>

      {/* Admin link for OWNER/ADMIN */}
      {user && (user.role === 'OWNER' || user.role === 'ADMIN') && (
        <div className="px-2 py-1">
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:bg-purple-50 hover:text-purple-700'
              }`
            }
          >
            <Shield size={18} className="shrink-0" />
            <span className="truncate">Admin</span>
          </NavLink>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-[var(--border-color)] p-2 space-y-0.5">
        {user && !collapsed && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.name}</p>
            <p className="text-xs text-[var(--text-tertiary)] truncate">{user.email}</p>
          </div>
        )}

        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] hover:text-[var(--text-primary)] transition w-full"
          title="Alternar tema"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {!collapsed && <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>}
        </button>

        <button
          onClick={() => { localStorage.removeItem('atendia_onboarding_done'); window.location.reload(); }}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] hover:text-[var(--text-primary)] transition w-full"
          title="Como usar"
        >
          <Zap size={18} />
          {!collapsed && <span>Como usar</span>}
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--color-error-bg)] hover:text-[var(--color-error)] transition w-full"
          title="Sair"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 bg-[var(--surface-primary)] border border-[var(--border-color)] text-[var(--text-primary)] p-2 rounded-lg shadow-soft"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-40 w-64 bg-[var(--surface-primary)] border-r border-[var(--border-color)] flex flex-col transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {nav}
      </aside>

      {/* Desktop sidebar */}
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