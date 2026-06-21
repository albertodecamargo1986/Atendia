import { useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/auth';
import { Check, Crown, Loader2, ArrowUp, Zap } from 'lucide-react';

const PLANS = [
  {
    id: 'FREE',
    name: 'Free',
    price: 0,
    period: '',
    desc: 'Para testar o sistema',
    features: ['1 agente', '1 WhatsApp', '100 conversas/mês', '500 requisições de IA'],
    color: 'gray',
  },
  {
    id: 'STARTER',
    name: 'Starter',
    price: 147,
    period: '/mês',
    desc: 'Ideal para pequenos negócios',
    features: ['3 agentes', '2 WhatsApp', '1.000 conversas/mês', '5.000 requisições de IA', 'Filas de atendimento', 'Respostas rápidas', 'Horário comercial'],
    color: 'blue',
    popular: false,
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: 381,
    period: '/mês',
    desc: 'Para equipes em crescimento',
    features: ['10 agentes', '5 WhatsApp', '10.000 conversas/mês', '50.000 requisições de IA', 'Campanhas em massa', 'Perfis de voz', 'Webhooks e relatórios', 'Chat interno'],
    color: 'purple',
    popular: true,
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    price: 1044,
    period: '/mês',
    desc: 'Solução completa e ilimitada',
    features: ['Agentes ilimitados', 'WhatsApp ilimitado', 'Conversas ilimitadas', 'IA ilimitada', 'Todos os módulos', 'Suporte prioritário'],
    color: 'yellow',
  },
];

export default function UpgradePage() {
  const { user } = useAuthStore();
  const currentPlan = user?.tenant?.plan || 'FREE';
  const [selectedPlan, setSelectedPlan] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmModal, setConfirmModal] = useState(false);

  async function handleUpgrade() {
    if (!selectedPlan) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/payments/upgrade-plan', { plan: selectedPlan });
      setSuccess(`Plano alterado para ${selectedPlan} com sucesso!`);
      setConfirmModal(false);
      // Atualiza o store do usuário
      useAuthStore.getState().checkAuth();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao fazer upgrade');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Planos</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Escolha o plano ideal para seu negócio</p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}
      {success && (
        <div className="mb-6 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg flex items-center gap-2">
          <Check size={16} /> {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const isSelected = selectedPlan === plan.id;
          const isDowngrade = plan.id === 'FREE' && currentPlan !== 'FREE';

          return (
            <div
              key={plan.id}
              className={`relative rounded-xl border-2 p-6 transition-all ${
                isCurrent
                  ? 'border-purple-500 bg-purple-50/30'
                  : isSelected
                  ? 'border-purple-400 bg-[var(--surface-primary)] shadow-lg'
                  : 'border-[var(--border-color)] bg-[var(--surface-primary)] hover:border-purple-300'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                  <Zap size={12} /> Mais Popular
                </div>
              )}

              {isCurrent && (
                <div className="absolute top-3 right-3 px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full">
                  Atual
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-bold text-[var(--text-primary)]">{plan.name}</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{plan.desc}</p>
              </div>

              <div className="mb-4">
                <span className="text-3xl font-bold text-[var(--text-primary)]">
                  {plan.price === 0 ? 'Grátis' : `R$ ${plan.price}`}
                </span>
                {plan.period && (
                  <span className="text-sm text-[var(--text-secondary)]">{plan.period}</span>
                )}
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <Check size={14} className="text-green-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {!isCurrent && !isDowngrade && (
                <button
                  onClick={() => { setSelectedPlan(plan.id); setConfirmModal(true); }}
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
                >
                  {loading && selectedPlan === plan.id ? (
                    <Loader2 size={16} className="animate-spin mx-auto" />
                  ) : (
                    <span className="flex items-center justify-center gap-1">
                      <ArrowUp size={14} /> Contratar
                    </span>
                  )}
                </button>
              )}

              {isDowngrade && (
                <p className="text-center text-xs text-[var(--text-tertiary)]">Plano gratuito</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal de confirmação */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmModal(false)}>
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <Crown size={40} className="mx-auto text-purple-600 mb-2" />
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Confirmar Upgrade</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Deseja alterar seu plano de <strong>{currentPlan}</strong> para <strong>{selectedPlan}</strong>?
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(false)} className="flex-1 px-4 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface-secondary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">
                Cancelar
              </button>
              <button onClick={handleUpgrade} disabled={loading}
                className="flex-1 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition flex items-center justify-center gap-1">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
                Confirmar Upgrade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
