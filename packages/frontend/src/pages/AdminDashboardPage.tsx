import { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Building2, Users, Bot, MessageSquare, CreditCard, Key, TrendingUp,
  Loader2, CheckCircle, XCircle, Clock, DollarSign, Wifi, ArrowUp, ArrowDown,
} from 'lucide-react';

interface DashboardStats {
  tenants: { total: number; active: number };
  licenses: { total: number; active: number };
  payments: { total: number; totalRevenue: number };
  users: { total: number };
  conversations: { total: number };
  online: { count: number };
  planDistribution: { plan: string; count: number }[];
  recentTenants: any[];
  recentPayments: any[];
  monthlyRevenue: { date: string; amount: number }[];
  monthlyTenants: { date: string; count: number }[];
  topTenants: { id: string; name: string; plan: string; _count: { conversations: number; users: number; agents: number } }[];
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

function BarChart({ data, height = 160, color = 'bg-purple-500' }: { data: { label: string; value: number }[]; height?: number; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative" title={`${d.label}: ${d.value}`}>
          <div
            className={`w-full rounded-t ${color} transition-all duration-500 min-h-[4px]`}
            style={{ height: `${(d.value / max) * 100}%` }}
          />
          <span className="text-[10px] text-[var(--text-tertiary)] truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

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

  // Preparar dados para gráficos
  const revenueByMonth = (stats.monthlyRevenue || []).reduce((acc: Record<string, number>, r) => {
    const month = new Date(r.date).toLocaleDateString('pt-BR', { month: 'short' });
    acc[month] = (acc[month] || 0) + r.amount;
    return acc;
  }, {});
  const revenueData = Object.entries(revenueByMonth).map(([label, value]) => ({ label, value }));

  const tenantsByMonth = (stats.monthlyTenants || []).reduce((acc: Record<string, number>, r) => {
    const month = new Date(r.date).toLocaleDateString('pt-BR', { month: 'short' });
    acc[month] = (acc[month] || 0) + r.count;
    return acc;
  }, {});
  const tenantsChartData = Object.entries(tenantsByMonth).map(([label, value]) => ({ label, value }));

  const cards = [
    { label: 'Tenants', value: stats.tenants.total, sub: `${stats.tenants.active} ativos`, icon: Building2, color: 'bg-indigo-50 text-indigo-600' },
    { label: 'Usuários', value: stats.users.total, sub: 'total no sistema', icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Conversas', value: stats.conversations.total, sub: 'em todo sistema', icon: MessageSquare, color: 'bg-green-50 text-green-600' },
    { label: 'Licenças', value: stats.licenses.total, sub: `${stats.licenses.active} ativas`, icon: Key, color: 'bg-purple-50 text-purple-600' },
    { label: 'Receita', value: `R$ ${(stats.payments.totalRevenue || 0).toFixed(2)}`, sub: `${stats.payments.total} pagamentos`, icon: DollarSign, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Online', value: stats.online?.count || 0, sub: 'usuarios agora', icon: Wifi, color: 'bg-green-50 text-green-600' },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Painel Administrativo</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Visão geral do sistema AtendIA</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-4">
            <div className={`w-9 h-9 rounded-lg ${card.color} flex items-center justify-center mb-2`}>
              <card.icon size={18} />
            </div>
            <p className="text-xl font-bold text-[var(--text-primary)]">{card.value}</p>
            <p className="text-xs font-medium text-[var(--text-primary)]">{card.label}</p>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5">
          <h2 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Receita Mensal</h2>
          {revenueData.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Nenhum dado de receita</p>
          ) : (
            <BarChart data={revenueData} height={140} color="bg-emerald-500" />
          )}
        </div>

        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5">
          <h2 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Novos Tenants / Mês</h2>
          {tenantsChartData.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Nenhum dado de cadastro</p>
          ) : (
            <BarChart data={tenantsChartData} height={140} color="bg-blue-500" />
          )}
        </div>

        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5">
          <h2 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Distribuição de Planos</h2>
          <div className="space-y-2.5">
            {stats.planDistribution.map((p) => {
              const pct = stats.tenants.total > 0 ? ((p.count / stats.tenants.total) * 100).toFixed(1) : '0';
              return (
                <div key={p.plan}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${planColors[p.plan] || 'bg-gray-100 text-gray-600'}`}>{p.plan}</span>
                    <span className="text-[var(--text-secondary)]">{p.count} ({pct}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Tenants e Pagamentos Recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

        {/* Top Tenants */}
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5">
          <h2 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Top Tenants (conversas)</h2>
          {(stats.topTenants || []).length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Nenhum tenant com conversas</p>
          ) : (
            <div className="space-y-2">
              {stats.topTenants.slice(0, 5).map((t, i) => (
                <div key={t.id} className="flex items-center justify-between py-1.5 border-b border-[var(--border-color)] last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-[var(--text-tertiary)] w-5">#{i + 1}</span>
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{t.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${planColors[t.plan] || ''}`}>{t.plan}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-[var(--text-tertiary)]">
                    <span>{t._count.conversations} conv.</span>
                    <span>{t._count.users} usu.</span>
                    <span>{t._count.agents} ag.</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Payments */}
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5">
          <h2 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Pagamentos Recentes</h2>
          {stats.recentPayments.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Nenhum pagamento recente</p>
          ) : (
            <div className="space-y-2">
              {stats.recentPayments.slice(0, 5).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-[var(--border-color)] last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{p.customer.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{p.plan} · {new Date(p.createdAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-[var(--text-primary)]">R$ {p.amount.toFixed(2)}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${paymentStatusColors[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Tenants */}
      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5">
        <h2 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Tenants Recentes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                <th className="text-left py-2.5 px-3 font-medium text-[var(--text-tertiary)] text-xs">Nome</th>
                <th className="text-left py-2.5 px-3 font-medium text-[var(--text-tertiary)] text-xs">Plano</th>
                <th className="text-left py-2.5 px-3 font-medium text-[var(--text-tertiary)] text-xs">Usuários</th>
                <th className="text-left py-2.5 px-3 font-medium text-[var(--text-tertiary)] text-xs">Status</th>
                <th className="text-left py-2.5 px-3 font-medium text-[var(--text-tertiary)] text-xs">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentTenants.map((t: any) => (
                <tr key={t.id} className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--surface-tertiary)]">
                  <td className="py-2.5 px-3">
                    <p className="font-medium text-[var(--text-primary)] text-sm">{t.name}</p>
                    <p className="text-[10px] text-[var(--text-tertiary)]">{t.slug}</p>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${planColors[t.plan] || ''}`}>{t.plan}</span>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-[var(--text-secondary)]">{t._count.users}</td>
                  <td className="py-2.5 px-3">
                    {t.isActive
                      ? <span className="flex items-center gap-1 text-[10px] text-green-700"><CheckCircle size={10} /> Ativo</span>
                      : <span className="flex items-center gap-1 text-[10px] text-red-600"><XCircle size={10} /> Inativo</span>
                    }
                  </td>
                  <td className="py-2.5 px-3 text-[10px] text-[var(--text-tertiary)]">{new Date(t.createdAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
