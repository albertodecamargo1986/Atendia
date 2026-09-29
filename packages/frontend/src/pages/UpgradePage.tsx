import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, Loader2, ArrowUpCircle, Zap, Tag, Lock, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { useAuthStore } from '../stores/auth';
import { getErrorMessage, getErrorStatus, getErrorCode } from '../lib/errors';
import { isValidCPF, isValidCNPJ, isValidPhone, maskCPFCNPJ, maskPhone } from '../lib/masks';
import { fetchPublicPlans, formatPrice, planBullets, type PublicPlan } from '../lib/publicPlans';
import { PLAN_LABELS } from '../lib/plans';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';

const PAYMENT_NOT_CONFIGURED = 'Pagamentos ainda não configurados — fale com o suporte.';

export default function UpgradePage() {
  const { user, tenant } = useAuthStore();
  const location = useLocation();
  const locked = (location.state as { lockedFeature?: string; planNeeded?: string } | null) || null;
  const currentPlan = (tenant?.plan || 'FREE').toUpperCase();

  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PublicPlan | null>(null);

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  useEffect(() => {
    fetchPublicPlans().then(({ plans: list }) => setPlans(list)).finally(() => setPlansLoading(false));
  }, []);

  useEffect(() => {
    if (user) { setName((n) => n || user.name); setEmail((e) => e || user.email); }
  }, [user]);

  function openCheckout(plan: PublicPlan) {
    setSelectedPlan(plan);
    setPayError('');
    setCoupon(null);
    setCouponCode('');
    setCouponError('');
  }

  async function handleValidateCoupon() {
    if (!couponCode.trim() || !selectedPlan) return;
    setCouponLoading(true);
    setCouponError('');
    setCoupon(null);
    try {
      const { data } = await api.post('/payments/validate-coupon', { code: couponCode, plan: selectedPlan.key });
      setCoupon(data.data || data);
      toast.success('Cupom aplicado!');
    } catch (err) {
      setCouponError(getErrorMessage(err, 'Cupom inválido.'));
    } finally {
      setCouponLoading(false);
    }
  }

  async function handleCheckout() {
    if (!selectedPlan) return;
    setPayError('');
    const digits = cpfCnpj.replace(/\D/g, '');
    if (name.trim().length < 3) return setPayError('Informe o nome completo.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setPayError('Informe um e-mail válido.');
    if (!(digits.length === 11 ? isValidCPF(digits) : digits.length === 14 ? isValidCNPJ(digits) : false)) {
      return setPayError('CPF ou CNPJ inválido. Confira os números.');
    }
    if (!isValidPhone(phone)) return setPayError('Telefone inválido. Use DDD + número.');

    setPaying(true);
    try {
      const { data } = await api.post('/payments/checkout', {
        name: name.trim(),
        email: email.trim(),
        cpfCnpj: digits,
        phone: phone.replace(/\D/g, ''),
        plan: selectedPlan.key,
        targetPlan: selectedPlan.key,
        coupon: coupon?.code || undefined,
        gateway: 'mercadopago',
      });
      const payload = data?.data ?? data;
      const url = payload?.initPoint || payload?.checkoutUrl || payload?.url || payload?.sandboxInitPoint;
      if (url) {
        toast.info('Abrindo a página de pagamento...');
        window.location.href = url;
        return;
      }
      setPayError('Não recebemos o link de pagamento. Tente de novo ou fale com o suporte.');
    } catch (err) {
      const status = getErrorStatus(err);
      const code = getErrorCode(err);
      if (status === 422 || status === 501 || status === 503 || code === 'PAYMENTS_NOT_CONFIGURED') {
        setPayError(PAYMENT_NOT_CONFIGURED);
      } else {
        setPayError(getErrorMessage(err, 'Não foi possível iniciar o pagamento.'));
      }
    } finally {
      setPaying(false);
    }
  }

  function priceWithCoupon(v: number) {
    if (!coupon) return v;
    return Math.round((v - (v * coupon.discount) / 100) * 100) / 100;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Mudar plano</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Seu plano atual: <strong>{PLAN_LABELS[currentPlan] || currentPlan}</strong>
        </p>
      </div>

      {locked?.lockedFeature && (
        <Alert variant="info" className="mb-6" title={`${locked.lockedFeature} não está no seu plano`}>
          <span className="inline-flex items-center gap-1"><Lock size={13} /> Disponível no plano {locked.planNeeded || 'Pro'}. Escolha um plano abaixo para liberar.</span>
        </Alert>
      )}

      {plansLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary-500)]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-xl border-2 p-5 bg-[var(--surface-primary)] ${
                  isCurrent ? 'border-[var(--color-success)]' : plan.highlighted ? 'border-[var(--color-primary-500)]' : 'border-[var(--border-color)]'
                }`}
              >
                {plan.highlighted && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[var(--color-primary-500)] text-white text-xs font-bold rounded-full flex items-center gap-1">
                    <Zap size={12} /> Mais popular
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute top-3 right-3 px-2 py-0.5 bg-[var(--color-success-bg)] text-[var(--color-success)] text-[10px] font-bold rounded-full">Seu plano</div>
                )}
                <h2 className="text-lg font-bold text-[var(--text-primary)]">{plan.name}</h2>
                {plan.description && <p className="text-xs text-[var(--text-secondary)]">{plan.description}</p>}
                <div className="my-3">
                  <span className="text-3xl font-bold text-[var(--text-primary)]">{formatPrice(plan.priceMonthly)}</span>
                  {plan.priceMonthly > 0 && <span className="text-sm text-[var(--text-secondary)]">/mês</span>}
                </div>
                <ul className="space-y-1.5 mb-5 flex-1">
                  {planBullets(plan).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                      <Check size={14} className="text-[var(--color-success)] mt-0.5 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && plan.priceMonthly > 0 && (
                  <Button onClick={() => openCheckout(plan)} className="w-full">
                    <ArrowUpCircle size={16} /> Escolher {plan.name}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-center text-[var(--text-tertiary)]">
        O pagamento é feito no Mercado Pago. Depois da confirmação, o novo plano é liberado automaticamente.
        Para voltar ao plano grátis, fale com o suporte.
      </p>

      <Modal
        open={!!selectedPlan}
        onClose={() => setSelectedPlan(null)}
        title={`Assinar o plano ${selectedPlan?.name || ''}`}
        description={selectedPlan ? `${formatPrice(priceWithCoupon(selectedPlan.priceMonthly))} por mês` : undefined}
        size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setSelectedPlan(null)}>Cancelar</Button>
          <Button onClick={handleCheckout} loading={paying}>
            {!paying && <CreditCard size={16} />} Ir para o pagamento
          </Button>
        </>}
      >
        <div className="space-y-3">
          {payError && <Alert variant={payError === PAYMENT_NOT_CONFIGURED ? 'warning' : 'error'}>{payError}</Alert>}
          <Input label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="CPF ou CNPJ" value={cpfCnpj} onChange={(e) => setCpfCnpj(maskCPFCNPJ(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
            <Input label="Telefone" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" />
          </div>
          <div className="pt-2">
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1 flex items-center gap-1"><Tag size={14} /> Cupom de desconto (opcional)</p>
            {coupon ? (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success-border)] text-sm">
                <span><strong>{coupon.code}</strong> — {coupon.discount}% de desconto</span>
                <button onClick={() => { setCoupon(null); setCouponCode(''); }} className="text-xs text-[var(--color-error)] hover:underline">Remover</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Código do cupom" aria-label="Código do cupom"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleValidateCoupon(); } }}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
                <Button variant="secondary" onClick={handleValidateCoupon} loading={couponLoading} disabled={!couponCode.trim()}>Aplicar</Button>
              </div>
            )}
            {couponError && <p className="text-xs text-[var(--color-error)] mt-1">{couponError}</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
