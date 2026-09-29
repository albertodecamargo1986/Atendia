import { ValidationError, NotFoundError, ForbiddenError, AppError } from '../lib/errors.js';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { Stripe } from 'stripe';
import prisma from '../lib/prisma.js';
import { getPublicUrls } from '../config/index.js';
import { PLANS, type PlanId } from '../config/plans.js';
import { approvePayment, rejectPayment, refundPayment } from './payment-approval.service.js';

/** Planos antigos do checkout avulso (mantidos por compatibilidade). */
const LEGACY_PLAN_CONFIG: Record<string, { name: string; price: number; months: number }> = {
  mensal: { name: 'AtendIA Mensal', price: 147, months: 1 },
  trimestral: { name: 'AtendIA Trimestral', price: 381, months: 3 },
  semestral: { name: 'AtendIA Semestral', price: 642, months: 6 },
  anual: { name: 'AtendIA Anual', price: 1044, months: 12 },
};

const PAID_PLANS = ['STARTER', 'PRO', 'ENTERPRISE'] as const;
type PaidPlan = (typeof PAID_PLANS)[number];

export function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === 'string' && (PAID_PLANS as readonly string[]).includes(value);
}

export class PaymentsNotConfiguredError extends AppError {
  constructor(message = 'Pagamentos ainda não configurados. Fale com o suporte para mudar de plano.') {
    super(message, 'PAYMENTS_NOT_CONFIGURED', 503);
  }
}

function mpAccessToken(): string {
  const sandbox = process.env.MP_SANDBOX === 'true';
  const token = sandbox ? process.env.MP_SANDBOX_TOKEN || process.env.MP_ACCESS_TOKEN : process.env.MP_ACCESS_TOKEN;
  return token?.trim() || '';
}

export function isMercadoPagoConfigured(): boolean {
  return !!mpAccessToken();
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.trim();
}

function getMpClient(): MercadoPagoConfig {
  const token = mpAccessToken();
  if (!token) throw new PaymentsNotConfiguredError();
  return new MercadoPagoConfig({ accessToken: token });
}

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new PaymentsNotConfiguredError();
  return new Stripe(key, { apiVersion: '2024-04-10' });
}

export interface CheckoutInput {
  name: string;
  email: string;
  cpfCnpj: string;
  phone: string;
  plan: string;
  targetPlan?: string;
  coupon?: string;
}

interface ResolvedCheckout {
  title: string;
  price: number;
  months: number;
  /** Valor gravado em Payment.plan: 'STARTER'|'PRO'|'ENTERPRISE' (troca de plano) ou legado ('mensal'...) */
  planValue: string;
  couponId?: string;
}

/** Calcula o preço (PlanConfig do banco) e aplica cupom, SEM gravar nada. */
async function resolveCheckout(input: CheckoutInput): Promise<ResolvedCheckout> {
  const requested = isPaidPlan(input.targetPlan) ? input.targetPlan : input.plan;

  let resolved: ResolvedCheckout;
  if (isPaidPlan(requested)) {
    const config = await prisma.planConfig.findUnique({ where: { planId: requested } });
    if (config && !config.isActive) throw new ValidationError('Este plano não está disponível no momento');
    const price = config?.price ?? PLANS[requested as PlanId].price;
    resolved = {
      title: `AtendIA — Plano ${config?.name || PLANS[requested as PlanId].name}`,
      price,
      months: 1,
      planValue: requested,
    };
  } else if (LEGACY_PLAN_CONFIG[requested]) {
    const legacy = LEGACY_PLAN_CONFIG[requested];
    resolved = { title: legacy.name, price: legacy.price, months: legacy.months, planValue: requested };
  } else {
    throw new ValidationError(`Plano inválido: ${requested}`);
  }

  if (input.coupon) {
    const coupon = await prisma.coupon.findUnique({ where: { code: input.coupon.trim().toUpperCase() } });
    if (!coupon || !coupon.isActive) throw new ValidationError('Cupom inválido');
    if (coupon.usedCount >= coupon.maxUses) throw new ValidationError('Cupom esgotado');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new ValidationError('Cupom expirado');
    if (isPaidPlan(resolved.planValue) && coupon.plan !== resolved.planValue) {
      throw new ValidationError(`Cupom válido apenas para o plano ${coupon.plan}`);
    }
    const discount = Math.min(Math.max(coupon.discount, 0), 100);
    resolved.price = Math.round(resolved.price * (100 - discount)) / 100;
    resolved.couponId = coupon.id;
  }

  if (!(resolved.price > 0)) throw new ValidationError('Este plano não exige pagamento');
  return resolved;
}

/** Cliente de cobrança: vinculado ao tenant quando o usuário está logado. */
async function upsertCustomer(input: CheckoutInput, tenantId?: string) {
  const data = {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    cpfCnpj: input.cpfCnpj.replace(/\D/g, ''),
    phone: input.phone.replace(/\D/g, ''),
  };
  const existing = await prisma.customer.findFirst({
    where: tenantId ? { tenantId } : { email: data.email, tenantId: null },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return prisma.customer.update({ where: { id: existing.id }, data });
  }
  return prisma.customer.create({ data: { ...data, tenantId: tenantId ?? null } });
}

// ---------- Checkout Mercado Pago ----------

export async function createPreference(input: CheckoutInput, tenantId?: string) {
  // Configuração checada ANTES de gravar qualquer coisa (sem Customer/Payment órfãos)
  const client = getMpClient();
  const resolved = await resolveCheckout(input);
  const { FRONTEND_URL, API_URL } = getPublicUrls();

  const customer = await upsertCustomer(input, tenantId);
  const payment = await prisma.payment.create({
    data: {
      customerId: customer.id,
      gateway: 'MERCADOPAGO',
      amount: resolved.price,
      plan: resolved.planValue,
      periodMonths: resolved.months,
      status: 'PENDING',
    },
  });

  const digits = customer.cpfCnpj;
  try {
    const result = await new Preference(client).create({
      body: {
        items: [
          {
            id: payment.id,
            title: resolved.title,
            description: `Assinatura AtendIA - ${resolved.title}`,
            quantity: 1,
            unit_price: resolved.price,
            currency_id: 'BRL',
          },
        ],
        payer: {
          name: customer.name,
          email: customer.email,
          identification: { type: digits.length <= 11 ? 'CPF' : 'CNPJ', number: digits },
        },
        back_urls: {
          success: `${FRONTEND_URL}/upgrade?status=success`,
          failure: `${FRONTEND_URL}/upgrade?status=failure`,
          pending: `${FRONTEND_URL}/upgrade?status=pending`,
        },
        auto_return: 'approved',
        external_reference: payment.id,
        notification_url: `${API_URL}/payments/webhook/mercadopago`,
        metadata: { payment_id: payment.id, plan: resolved.planValue },
      },
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { mercadopagoPreferenceId: result.id },
    });

    if (resolved.couponId) {
      await prisma.coupon.update({ where: { id: resolved.couponId }, data: { usedCount: { increment: 1 } } }).catch(() => {});
    }

    const sandbox = process.env.MP_SANDBOX === 'true';
    return {
      preferenceId: result.id,
      initPoint: sandbox ? result.sandbox_init_point || result.init_point : result.init_point,
      sandboxInitPoint: result.sandbox_init_point,
      checkoutUrl: sandbox ? result.sandbox_init_point || result.init_point : result.init_point,
      paymentId: payment.id,
      amount: resolved.price,
    };
  } catch (err: any) {
    // Falha no Mercado Pago: não deixa pagamento pendente "fantasma"
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } }).catch(() => {});
    throw new AppError(`Não foi possível criar o pagamento no Mercado Pago: ${err?.message || 'erro desconhecido'}`, 'PAYMENT_GATEWAY_ERROR', 502);
  }
}

// ---------- Checkout Stripe ----------

export async function createStripeCheckoutSession(input: CheckoutInput, tenantId?: string) {
  const stripe = getStripeClient();
  const resolved = await resolveCheckout(input);
  const { FRONTEND_URL } = getPublicUrls();

  const customer = await upsertCustomer(input, tenantId);
  const payment = await prisma.payment.create({
    data: {
      customerId: customer.id,
      gateway: 'STRIPE',
      amount: resolved.price,
      plan: resolved.planValue,
      periodMonths: resolved.months,
      status: 'PENDING',
    },
  });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: customer.email,
      client_reference_id: payment.id,
      metadata: { payment_id: payment.id, plan: resolved.planValue },
      payment_intent_data: { metadata: { payment_id: payment.id, plan: resolved.planValue } },
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: { name: resolved.title },
            unit_amount: Math.round(resolved.price * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/upgrade?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/upgrade?status=cancelled`,
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { mercadopagoPreferenceId: session.id }, // campo reaproveitado para o id da sessão Stripe
    });

    if (resolved.couponId) {
      await prisma.coupon.update({ where: { id: resolved.couponId }, data: { usedCount: { increment: 1 } } }).catch(() => {});
    }

    return { sessionId: session.id, url: session.url, checkoutUrl: session.url, paymentId: payment.id, amount: resolved.price };
  } catch (err: any) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } }).catch(() => {});
    throw new AppError(`Não foi possível criar o pagamento no Stripe: ${err?.message || 'erro desconhecido'}`, 'PAYMENT_GATEWAY_ERROR', 502);
  }
}

// ---------- Webhook Mercado Pago ----------

/** Busca o pagamento na API do Mercado Pago (fonte da verdade — não confiamos no body). */
export async function fetchMercadoPagoPayment(mpPaymentId: string): Promise<any> {
  const token = mpAccessToken();
  if (!token) throw new PaymentsNotConfiguredError();
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Mercado Pago respondeu ${res.status} ao consultar o pagamento ${mpPaymentId}`);
  }
  return res.json();
}

/**
 * Processa a notificação de pagamento. A assinatura já foi validada na rota.
 * O status e a referência vêm da API do MP, nunca do corpo recebido.
 */
export async function handleMercadoPagoWebhook(mpPaymentId: string | undefined, type: string | undefined) {
  if (type && type !== 'payment') return { processed: false, type };
  if (!mpPaymentId) return { processed: false, reason: 'sem_id' };

  const mpPayment = await fetchMercadoPagoPayment(mpPaymentId);
  const externalRef: string | undefined = mpPayment?.external_reference || mpPayment?.metadata?.payment_id;

  let payment = externalRef
    ? await prisma.payment.findUnique({ where: { id: String(externalRef) } })
    : null;
  if (!payment) {
    payment = await prisma.payment.findFirst({ where: { gateway: 'MERCADOPAGO', gatewayTransactionId: mpPaymentId } });
  }
  if (!payment || payment.gateway !== 'MERCADOPAGO') {
    console.warn(`Webhook MP: pagamento local não encontrado (mp=${mpPaymentId})`);
    return { processed: false, reason: 'payment_not_found' };
  }

  const status: string = mpPayment?.status;
  const paidAmount = Number(mpPayment?.transaction_amount ?? 0);

  if (status === 'approved') {
    if (paidAmount + 0.01 < payment.amount) {
      console.warn(`Webhook MP: valor pago (${paidAmount}) menor que o esperado (${payment.amount}) — ignorado`);
      return { processed: false, reason: 'amount_mismatch' };
    }
    await approvePayment(payment.id, mpPaymentId, { mercadopagoStatus: status });
  } else if (status === 'rejected' || status === 'cancelled') {
    await rejectPayment(payment.id, mpPaymentId, status);
  } else if (status === 'refunded' || status === 'charged_back') {
    await refundPayment(payment.id, mpPaymentId, status);
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { mercadopagoStatus: status || null, gatewayTransactionId: mpPaymentId },
    });
  }

  return { processed: true, status };
}

// ---------- Status do pagamento ----------

export async function getPaymentStatus(paymentId: string, tenantId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { customer: { select: { tenantId: true } } },
  });

  if (!payment) throw new NotFoundError('Pagamento', paymentId);
  if (payment.customer.tenantId !== tenantId) throw new ForbiddenError('Acesso negado');

  return {
    id: payment.id,
    status: payment.status,
    plan: payment.plan,
    amount: payment.amount,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt,
  };
}
