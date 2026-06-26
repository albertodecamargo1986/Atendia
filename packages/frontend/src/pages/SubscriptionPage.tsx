import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import api from '../services/api';
import {
  CreditCard, CheckCircle, XCircle, Clock, Loader2,
  ArrowUp, AlertCircle, ChevronRight,
} from 'lucide-react';

const PLAN_LABELS: Record<string, string> = {
  FREE: 'Gratuito',
  STARTER: 'Starter',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
};

const STATUS_COLORS: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  REJECTED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

const SUB_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Ativa', color: 'text-green-600 bg-green-50' },
  PAST_DUE: { label: 'Vencida', color: 'text-red-600 bg-red-50' },
  CANCELED: { label: 'Cancelada', color: 'text-gray-500 bg-gray-100' },
  TRIALING: { label: 'Trial', color: 'text-blue-600 bg-blue-50' },
};

export default function SubscriptionPage() {
  const { tenant } = useAuthStore();
  const navigate = useNavigate();
  const [data, setData] = useState<{ payments: any[]; subscription: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      const { data: res } = await api.get('/payments/my-payments');
      setData(res.data);
    } catch {
      setError('Erro ao carregar dados da assinatura');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-purple-600" />
      </div>
    );
  }

  const currentPlan = tenant?.plan || 'FREE';
  const sub = data?.subscription;
  const payments = data?.payments || [];

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Assinatura</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Gerencie seu plano e veja o histórico de pagamentos</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Current Plan Card */}
      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
              <CreditCard size={28} className="text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                Plano {PLAN_LABELS[currentPlan] || currentPlan}
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                {tenant?.name || 'Seu tenant'}
                {sub && (
                  <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${SUB_STATUS[sub.status]?.color || 'bg-gray-100 text-gray-500'}`}>
                    {sub.status === 'ACTIVE' ? <CheckCircle size={12} /> : <Clock size={12} />}
                    {SUB_STATUS[sub.status]?.label || sub.status}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/upgrade')}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition"
            >
              <ArrowUp size={16} /> Mudar de Plano
            </button>
          </div>
        </div>

        {sub?.currentPeriodEnd && (
          <div className="mt-4 pt-4 border-t border-[var(--border-color)] flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Clock size={14} />
            <span>
              {sub.status === 'TRIALING' ? 'Trial até' : 'Período atual até'}:{' '}
              <strong>{new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR')}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Histórico de Pagamentos</h2>
        </div>

        {payments.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard size={40} className="mx-auto text-[var(--text-tertiary)] mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">Nenhum pagamento registrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[var(--surface-secondary)]">
                  <th className="text-left py-3 px-6 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">Data</th>
                  <th className="text-left py-3 px-6 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">Plano</th>
                  <th className="text-left py-3 px-6 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">Valor</th>
                  <th className="text-left py-3 px-6 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">Período</th>
                  <th className="text-left py-3 px-6 font-medium text-[var(--text-tertiary)] text-xs uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id} className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--surface-tertiary)] transition-colors">
                    <td className="py-3 px-6 text-[var(--text-primary)] whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-6 text-[var(--text-primary)] font-medium">{p.plan}</td>
                    <td className="py-3 px-6 text-[var(--text-primary)]">R$ {Number(p.amount).toFixed(2)}</td>
                    <td className="py-3 px-6 text-[var(--text-secondary)]">
                      {p.periodMonths ? `${p.periodMonths} ${p.periodMonths === 1 ? 'mês' : 'meses'}` : '-'}
                    </td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>
                        {p.status === 'APPROVED' ? <CheckCircle size={12} /> : p.status === 'PENDING' ? <Clock size={12} /> : <XCircle size={12} />}
                        {p.status === 'APPROVED' ? 'Aprovado' : p.status === 'PENDING' ? 'Pendente' : p.status === 'REJECTED' ? 'Rejeitado' : p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upgrade CTA */}
      {currentPlan !== 'ENTERPRISE' && (
        <div className="mt-6 bg-gradient-to-r from-purple-600 to-pink-500 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-lg font-bold">Faça upgrade do seu plano</h3>
              <p className="text-sm text-white/80 mt-1">Acesse mais agentes, conversas e recursos</p>
            </div>
            <button
              onClick={() => navigate('/upgrade')}
              className="flex items-center gap-1 px-5 py-2.5 bg-white text-purple-700 font-medium rounded-lg hover:bg-purple-50 transition text-sm"
            >
              Ver Planos <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
