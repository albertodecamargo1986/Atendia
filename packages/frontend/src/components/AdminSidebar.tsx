import { useState } from 'react';
import {
  LayoutDashboard, Building2, CreditCard,
  Settings, Shield, ArrowLeft, BookOpen, Wifi, Tag, ClipboardList, DollarSign, Menu, X, Layers, Globe,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

const adminNavItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/admin', label: 'Painel', icon: LayoutDashboard },
  { to: '/admin/clients', label: 'Clientes', icon: Building2 },
  { to: '/admin/payments', label: 'Pagamentos', icon: CreditCard },
  { to: '/admin/plans', label: 'Planos', icon: Layers },
  { to: '/admin/mercadopago', label: 'Mercado Pago', icon: DollarSign },
  { to: '/admin/coupons', label: 'Cupons', icon: Tag },
  { to: '/admin/online', label: 'Usuários on-line', icon: Wifi },
  { to: '/admin/audit-logs', label: 'Auditoria', icon: ClipboardList },
  { to: '/admin/permissions', label: 'Permissões', icon: Shield },
  { to: '/admin/domain', label: 'Domínio e HTTPS', icon: Globe },
  { to: '/admin/owner-guide', label: 'Guia do dono', icon: BookOpen },
  { to: '/admin/settings', label: 'Configurações', icon: Settings },
];

export default function AdminSidebar() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const content = (
    <>
      <div className="flex items-center gap-2 px-4 h-14 border-b border-[var(--border-color)] shrink-0">
        <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center shrink-0">
          <Shield size={16} className="text-white" />
        </div>
        <span className="text-base font-bold text-[var(--text-primary)]">Administração</span>
      </div>

      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto" aria-label="Menu da administração">
        {adminNavItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/admin'}
            onClick={() => setMobileOpen(false)}
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

      <div className="border-t border-[var(--border-color)] p-2">
        <button
          onClick={() => { setMobileOpen(false); navigate('/'); }}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] hover:text-[var(--text-primary)] transition"
        >
          <ArrowLeft size={18} />
          <span>Voltar ao sistema</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
        className="lg:hidden fixed top-3 left-3 z-50 bg-[var(--surface-primary)] border border-[var(--border-color)] text-[var(--text-primary)] p-2 rounded-lg shadow-soft"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-40 w-64 bg-[var(--surface-primary)] border-r border-[var(--border-color)] flex flex-col transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {content}
      </aside>

      <aside className="hidden lg:flex flex-col bg-[var(--surface-primary)] border-r border-[var(--border-color)] h-screen sticky top-0 w-60">
        {content}
      </aside>
    </>
  );
}
