import {
  LayoutDashboard, Building2, Key, CreditCard, Webhook,
  Settings, Shield, ArrowLeft, BookOpen, Wifi,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

const adminNavItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/clients', label: 'Clientes', icon: Building2 },
  { to: '/admin/licenses', label: 'Licenças', icon: Key },
  { to: '/admin/payments', label: 'Pagamentos', icon: CreditCard },
  { to: '/admin/online', label: 'Online', icon: Wifi },
  { to: '/admin/webhooks', label: 'Webhooks', icon: Webhook },
  { to: '/admin/permissions', label: 'Permissões', icon: Shield },
  { to: '/admin/owner-guide', label: 'Guia do Owner', icon: BookOpen },
  { to: '/admin/settings', label: 'Configurações', icon: Settings },
];

export default function AdminSidebar() {
  const navigate = useNavigate();

  return (
    <aside className="hidden lg:flex flex-col bg-[var(--surface-primary)] border-r border-[var(--border-color)] h-screen sticky top-0 w-60">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-[var(--border-color)] shrink-0">
        <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center shrink-0">
          <Shield size={16} className="text-white" />
        </div>
        <span className="text-base font-bold text-[var(--text-primary)]">Admin</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {adminNavItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/admin'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] hover:text-[var(--text-primary)]'
              }`
            }
          >
            <Icon size={18} className="shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Back to system */}
      <div className="border-t border-[var(--border-color)] p-2">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] hover:text-[var(--text-primary)] transition"
        >
          <ArrowLeft size={18} />
          <span>Voltar ao Sistema</span>
        </button>
      </div>
    </aside>
  );
}
