import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ArrowLeft, MessageSquare } from 'lucide-react';
import { useThemeStore } from '../stores/theme';
import { fetchPublicPlans, featureLabel, formatPrice, limitLines, type PublicPlan } from '../lib/publicPlans';

export default function PricingPage() {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    fetchPublicPlans().then(({ plans: list }) => setPlans(list)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--surface-secondary)] text-[var(--text-primary)]">
      <header className="bg-[var(--surface-primary)] border-b border-[var(--border-color)]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-2">
          <Link to="/login" className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <ArrowLeft size={16} /> Entrar
          </Link>
          <span className="flex items-center gap-2 text-lg font-bold">
            <span className="w-8 h-8 rounded-lg bg-[var(--color-primary-500)] flex items-center justify-center">
              <MessageSquare size={16} className="text-white" />
            </span>
            Atend<span className="text-[var(--color-primary-500)]">IA</span>
          </span>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 pt-12 pb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-3">Escolha seu plano</h1>
        <p className="text-base sm:text-lg text-[var(--text-secondary)] max-w-xl mx-auto">
          Seu WhatsApp atendendo clientes com inteligência artificial. Comece grátis e mude de plano quando quiser.
        </p>
        <button
          onClick={() => navigate('/register')}
          className="mt-6 inline-flex items-center justify-center px-6 py-3 rounded-lg bg-[var(--color-primary-500)] text-white font-medium hover:bg-[var(--color-primary-600)] transition"
        >
          Criar conta grátis
        </button>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-80 rounded-xl bg-[var(--surface-tertiary)] animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative flex flex-col bg-[var(--surface-primary)] rounded-xl border-2 p-6 ${
                  plan.highlighted ? 'border-[var(--color-primary-500)] shadow-card' : 'border-[var(--border-color)]'
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[var(--color-primary-500)] text-white text-xs font-bold rounded-full">
                    MAIS POPULAR
                  </span>
                )}
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                {plan.description && <p className="text-sm text-[var(--text-secondary)] mt-1">{plan.description}</p>}
                <div className="mt-4">
                  <span className="text-3xl font-bold">{formatPrice(plan.priceMonthly)}</span>
                  {plan.priceMonthly > 0 && <span className="text-sm text-[var(--text-secondary)]">/mês</span>}
                </div>
                <ul className="mt-4 space-y-2 flex-1">
                  {limitLines(plan.limits).map((l) => (
                    <li key={l} className="flex items-start gap-2 text-sm">
                      <Check size={16} className="text-[var(--color-success)] shrink-0 mt-0.5" /> {l}
                    </li>
                  ))}
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check size={16} className="text-[var(--color-success)] shrink-0 mt-0.5" /> {featureLabel(f)}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/register')}
                  className={`mt-6 w-full py-2.5 rounded-lg text-sm font-medium transition ${
                    plan.highlighted
                      ? 'bg-[var(--color-primary-500)] text-white hover:bg-[var(--color-primary-600)]'
                      : 'bg-[var(--surface-tertiary)] text-[var(--text-primary)] hover:opacity-90'
                  }`}
                >
                  {plan.priceMonthly > 0 ? 'Começar grátis' : 'Criar conta grátis'}
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-[var(--text-tertiary)] text-center mt-6">
          Todos os planos começam grátis. Depois de entrar, você muda de plano em "Mudar plano" e paga com segurança.
        </p>
      </section>
    </div>
  );
}
