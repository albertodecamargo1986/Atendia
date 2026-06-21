import { useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/auth';
import { Check, Crown, Loader2, ArrowUp, Zap, Tag } from 'lucide-react';

const PLANS = [
  {
    id: 'FREE', name: 'Free', price: 0, period: '',
    desc: 'Para testar o sistema',
    features: ['1 agente', '1 WhatsApp', '100 conversas/mês', '500 requisições de IA'],
  },
  {
    id: 'STARTER', name: 'Starter', price: 147, period: '/mês',
    desc: 'Ideal para pequenos negócios',
    features: ['3 agentes', '2 WhatsApp', '1.000 conversas/mês', '5.000 requisições de IA', 'Filas', 'Respostas rápidas', 'Horário comercial'],
    popular: false,
  },
  {
    id: 'PRO', name: 'Pro', price: 381, period: '/mês',
    desc: 'Para equipes em crescimento',
    features: ['10 agentes', '5 WhatsApp', '10.000 conversas/mês', '50.000 requisições de IA', 'Campanhas', 'Perfis de voz', 'Webhooks', 'Chat interno'],
    popular: true,
  },
  {
    id: 'ENTERPRISE', name: 'Enterprise', price: 1044, period: '/mês',
    desc: 'Solução completa e ilimitada',
    features: ['Agentes ilimitados', 'WhatsApp ilimitado', 'Conversas ilimitadas', 'IA ilimitada', 'Todos os módulos', 'Suporte prioritário'],
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

  // Cupom
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  async function handleUpgrade() {
    if (!selectedPlan) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/payments/upgrade-plan', { plan: selectedPlan, coupon: coupon?.code || null });
      setSuccess(`Plano alterado para ${selectedPlan} com sucesso!`);
      setConfirmModal(false);
      useAuthStore.getState().checkAuth();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao fazer upgrade');
    } finally {
      setLoading(false);
    }
  }

  async function handleValidateCoupon() {
    if (!couponCode.trim() || !selectedPlan) return;
    setCouponLoading(true);
    setCouponError('');
    setCoupon(null);
    try {
      const { data } = await api.post('/payments/validate-coupon', { code: couponCode, plan: selectedPlan });
      setCoupon(data.data);
    } catch (err: any) {
      setCouponError(err.response?.data?.error || 'Cupom inválido');
    } finally {
      setCouponLoading(false);
    }
  }

  function getDiscountedPrice(price: number): number {
    if (!coupon) return price;
    return price - (price * coupon.discount / 100);
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Planos</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Escolha o plano ideal para seu negócio</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg flex items-center gap-2">
          <Check size={16} /> {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const isSelected = selectedPlan === plan.id;
          const discounted = getDiscountedPrice(plan.price);
          const hasDiscount = coupon && discounted !== plan.price;

          return (
            <div
              key={plan.id}
              className={`relative rounded-xl border-2 p-5 transition-all ${
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
                <div className="absolute top-3 right-3 px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full">Atual</div>
              )}

              <div className="mb-3">
                <h3 className="text-lg font-bold text-[var(--text-primary)]">{plan.name}</h3>
                <p className="text-xs text-[var(--text-secondary)]">{plan.desc}</p>
              </div>

              <div className="mb-3">
                {plan.price === 0 ? (
                  <span className="text-3xl font-bold text-[var(--text-primary)]">Grátis</span>
                ) : (
                  <>
                    {hasDiscount && (
                      <span className="text-lg text-[var(--text-tertiary)] line-through mr-2">R$ {plan.price}</span>
                    )}
                    <span className="text-3xl font-bold text-[var(--text-primary)]">R$ {discounted}</span>
                    <span className="text-sm text-[var(--text-secondary)]">{plan.period}</span>
                    {hasDiscount && (
                      <span className="ml-2 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">-{coupon!.discount}%</span>
                    )}
                  </>
                )}
              </div>

              <ul className="space-y-1.5 mb-5">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <Check size={14} className="text-green-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {!isCurrent && plan.id !== 'FREE' && (
                <button onClick={() => { setSelectedPlan(plan.id); setConfirmModal(true); }}
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition">
                  {loading && selectedPlan === plan.id ? (
                    <Loader2 size={16} className="animate-spin mx-auto" />
                  ) : (
                    <span className="flex items-center justify-center gap-1"><ArrowUp size={14} /> Contratar</span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Cupom de desconto */}
      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5 mb-8">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Tag size={16} /> Cupom de Desconto
        </h3>
        {coupon ? (
          <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
            <div>
              <span className="font-bold text-green-700">{coupon.code}</span>
              <span className="ml-2 text-sm text-green-600">{coupon.discount}% de desconto aplicado</span>
            </div>
            <button onClick={() => { setCoupon(null); setCouponCode(''); }}
              className="text-xs text-red-500 hover:text-red-700">Remover</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Digite o código do cupom"
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none"
              onKeyDown={e => e.key === 'Enter' && handleValidateCoupon()} />
            <button onClick={handleValidateCoupon} disabled={couponLoading || !couponCode.trim() || !selectedPlan}
              className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition flex items-center gap-1">
              {couponLoading ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
              Validar
            </button>
          </div>
        )}
        {couponError && <p className="text-xs text-red-500 mt-1">{couponError}</p>}
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
              {coupon && (
                <p className="text-xs text-green-600 mt-2">Cupom {coupon.code}: -{coupon.discount}% de desconto aplicado</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(false)}
                className="flex-1 px-4 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface-secondary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">
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
