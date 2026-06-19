import { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Building2, Users, Bot, MessageSquare, CreditCard, Key, TrendingUp,
  Loader2, CheckCircle, XCircle, Clock, DollarSign,
} from 'lucide-react';

interface DashboardStats {
  tenants: { total: number; active: number };
  licenses: { total: number; active: number };
  payments: { total: number; totalRevenue: number };
  users: { total: number };
  conversations: { total: number };
  planDistribution: { plan: string; count: number }[];
  recentTenants: { id: string; name: string; slug: string; plan: string; isActive: boolean; createdAt: string; _count: { users: number } }[];
  recentPayments: { id: string; amount: number; status: string; plan: string; createdAt: string; customer: { name: string; email: string } }[];
}

const planColors: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-600',
  STARTER: 'bg-blue-100 text-blue-700',
  PRO: 'bg-purple-100 text-purple-700',
  ENTERPRISE: 'bg-yellow-100 text-yellow-700',
};

const paymentStatusColors: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  REJECTED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-gray-100 text-gray-600',
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const { data } = await api.get('/admin/dashboard');
      setStats(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-purple-600" />
      </div>
    );
  }

  if (!stats) {
    return <div className="text-center py-16 text-[var(--text-tertiary)]">Erro ao carregar dados</div>;
  }

  const cards = [
    { label: 'Tenants', value: stats.tenants.total, sub: `${stats.tenants.active} ativos`, icon: Building2, color: 'bg-indigo-50 text-indigo-600' },
    { label: 'Usuários', value: stats.users.total, sub: 'total no sistema', icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Conversas', value: stats.conversations.total, sub: 'em todo sistema', icon: MessageSquare, color: 'bg-green-50 text-green-600' },
    { label: 'Licenças', value: stats.licenses.total, sub: `${stats.licenses.active} ativas`, icon: Key, color: 'bg-purple-50 text-purple-600' },
    { label: 'Pagamentos', value: stats.payments.total, sub: `R$ ${(stats.payments.totalRevenue || 0).toFixed(2)}`, icon: CreditCard, color: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Painel Administrativo</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Visão geral do sistema AtendIA</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-4">
            <div className={`w-10 h-10 rounded-lg ${card.color} flex items-center justify-center mb-3`}>
              <card.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{card.value}</p>
            <p className="text-sm font-medium text-[var(--text-primary)]">{card.label}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Plan Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Distribuição de Planos</h2>
          <div className="space-y-3">
            {stats.planDistribution.map((p) => (
              <div key={p.plan} className="flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${planColors[p.plan] || 'bg-gray-100 text-gray-600'}`}>
                  {p.plan}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{ width: `${(p.count / stats.tenants.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-[var(--text-primary)]">{p.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Pagamentos Recentes</h2>
          {stats.recentPayments.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Nenhum pagamento recente</p>
          ) : (
            <div className="space-y-3">
              {stats.recentPayments.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-[var(--border-color)] last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{p.customer.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{p.plan} · {new Date(p.createdAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-[var(--text-primary)]">R$ {p.amount.toFixed(2)}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${paymentStatusColors[p.status] || 'bg-gray-100 text-gray-600'}`}>
                      {p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Tenants */}
      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Tenants Recentes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                <th className="text-left py-3 px-4 font-medium text-[var(--text-tertiary)]">Nome</th>
                <th className="text-left py-3 px-4 font-medium text-[var(--text-tertiary)]">Plano</th>
                <th className="text-left py-3 px-4 font-medium text-[var(--text-tertiary)]">Usuários</th>
                <th className="text-left py-3 px-4 font-medium text-[var(--text-tertiary)]">Status</th>
                <th className="text-left py-3 px-4 font-medium text-[var(--text-tertiary)]">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentTenants.map((t) => (
                <tr key={t.id} className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--surface-tertiary)]">
                  <td className="py-3 px-4">
                    <p className="font-medium text-[var(--text-primary)]">{t.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{t.slug}</p>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${planColors[t.plan] || ''}`}>{t.plan}</span>
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)]">{t._count.users}</td>
                  <td className="py-3 px-4">
                    {t.isActive
                      ? <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle size={12} /> Ativo</span>
                      : <span className="flex items-center gap-1 text-xs text-red-600"><XCircle size={12} /> Inativo</span>
                    }
                  </td>
                  <td className="py-3 px-4 text-xs text-[var(--text-tertiary)]">
                    {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
