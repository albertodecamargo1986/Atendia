import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import {
  createPreference,
  handleMercadoPagoWebhook,
  getPaymentStatus,
  createStripeCheckoutSession,
  isMercadoPagoConfigured,
  isStripeConfigured,
  PaymentsNotConfiguredError,
} from '../services/mercadopago.service.js';
import { handleSubscriptionWebhook } from '../services/mercadopago-subscription.service.js';
import { handleStripeWebhook, constructStripeEvent } from '../services/stripe.service.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { webhookLimiter, checkoutLimiter } from '../middlewares/rate-limiter.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { verifyMercadoPagoSignature } from '../lib/mercadopago-signature.js';
import prisma from '../lib/prisma.js';

export const paymentsRouter = Router();

/** Autenticação opcional: se houver token válido, preenche req.user; senão segue anônimo. */
function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const headerToken = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const token = headerToken || req.cookies?.accessToken;
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      /* token inválido: segue como anônimo */
    }
  }
  next();
}

/** Valida a assinatura do webhook do Mercado Pago. Sem segredo: rejeita em produção. */
function checkMpSignature(req: Request): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim() || '';
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('MP_WEBHOOK_SECRET não configurado em produção — webhook rejeitado');
      return false;
    }
    console.warn('Webhook MP sem verificação de assinatura (sem MP_WEBHOOK_SECRET, ambiente de desenvolvimento)');
    return true;
  }
  const queryId = (req.query['data.id'] ?? req.query.id) as string | undefined;
  const dataId = queryId ?? (req.body?.data?.id != null ? String(req.body.data.id) : undefined);
  return verifyMercadoPagoSignature({
    xSignature: req.headers['x-signature'] as string | undefined,
    xRequestId: req.headers['x-request-id'] as string | undefined,
    dataId,
    secret,
  });
}

// ---------- Checkout (público ou autenticado) ----------

const checkoutSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  cpfCnpj: z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => v.length === 11 || v.length === 14, 'CPF/CNPJ inválido'),
  phone: z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => v.length >= 10 && v.length <= 13, 'Telefone inválido'),
  plan: z.enum(['mensal', 'trimestral', 'semestral', 'anual', 'STARTER', 'PRO', 'ENTERPRISE']),
  targetPlan: z.enum(['STARTER', 'PRO', 'ENTERPRISE']).optional(),
  coupon: z.string().trim().max(50).optional(),
  gateway: z.enum(['mercadopago', 'stripe']).default('mercadopago'),
});

paymentsRouter.post('/checkout', checkoutLimiter, optionalAuth, asyncHandler(async (req: Request, res: Response) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }
  const { gateway, ...input } = parsed.data;

  // Gateway configurado? (verificado antes de gravar Customer/Payment)
  if (gateway === 'stripe' ? !isStripeConfigured() : !isMercadoPagoConfigured()) {
    throw new PaymentsNotConfiguredError();
  }

  // Usuário logado: pagamento vinculado ao tenant dele (plano troca ao aprovar)
  let tenantId: string | undefined;
  if (req.user) {
    if (!['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      throw new ForbiddenError('Apenas o dono ou administrador da conta pode mudar o plano');
    }
    tenantId = req.user.tenantId;
  }

  const result = gateway === 'stripe'
    ? await createStripeCheckoutSession(input, tenantId)
    : await createPreference(input, tenantId);

  res.json({ success: true, data: result, ...result });
}));

// ---------- Webhooks Mercado Pago (chamados pelo MP) ----------

paymentsRouter.post('/webhook/mercadopago', webhookLimiter, async (req: Request, res: Response) => {
  if (!checkMpSignature(req)) {
    res.status(401).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Assinatura inválida' } });
    return;
  }
  try {
    const type = (req.body?.type || req.query.type || req.query.topic) as string | undefined;
    const queryId = (req.query['data.id'] ?? req.query.id) as string | undefined;
    const mpPaymentId = queryId ?? (req.body?.data?.id != null ? String(req.body.data.id) : undefined);
    const result = await handleMercadoPagoWebhook(mpPaymentId, type);
    res.json(result);
  } catch (err: any) {
    console.error('Erro no webhook MP:', err.message);
    // 500 faz o Mercado Pago reenviar a notificação mais tarde
    res.status(500).json({ received: false });
  }
});

paymentsRouter.post('/webhook/mercadopago/subscription', webhookLimiter, async (req: Request, res: Response) => {
  if (!checkMpSignature(req)) {
    res.status(401).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Assinatura inválida' } });
    return;
  }
  try {
    const result = await handleSubscriptionWebhook(req.body);
    res.json(result);
  } catch (err: any) {
    console.error('Erro no webhook de assinatura MP:', err.message);
    res.status(500).json({ received: false });
  }
});

paymentsRouter.get('/webhook/mercadopago', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

paymentsRouter.get('/webhook/mercadopago/subscription', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ---------- Webhook Stripe (assinatura verificada com o corpo bruto) ----------

paymentsRouter.post('/webhook/stripe', webhookLimiter, async (req: Request, res: Response) => {
  let event;
  try {
    event = constructStripeEvent((req as any).rawBody, req.headers['stripe-signature'] as string | undefined);
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: err.message } });
    return;
  }
  try {
    const result = await handleStripeWebhook(event);
    res.json(result);
  } catch (err: any) {
    console.error('Erro no webhook Stripe:', err.message);
    res.status(500).json({ received: false });
  }
});

paymentsRouter.get('/webhook/stripe', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ---------- Pagamentos do tenant ----------

paymentsRouter.get('/my-payments', authMiddleware, tenantMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;

  const payments = await prisma.payment.findMany({
    where: { customer: { tenantId } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      amount: true,
      plan: true,
      periodMonths: true,
      status: true,
      gateway: true,
      paidAt: true,
      createdAt: true,
    },
  });

  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });

  res.json({
    success: true,
    data: {
      payments,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            mercadopagoId: subscription.mercadopagoId,
          }
        : null,
    },
  });
}));

paymentsRouter.get('/:id/status', authMiddleware, tenantMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const result = await getPaymentStatus(req.params.id, req.user!.tenantId);
  res.json({ success: true, data: result });
}));

// ---------- Troca de plano direta ----------
// Sem pagamento: SOMENTE o dono da plataforma (SUPER_ADMIN). Clientes usam POST /checkout.

const PLANS_UPGRADE = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'] as const;

paymentsRouter.post('/upgrade-plan', authMiddleware, requireRole('SUPER_ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const { plan, tenantId: targetTenantId } = req.body ?? {};
  if (!plan || !PLANS_UPGRADE.includes(plan)) {
    throw new ValidationError('Plano inválido. Escolha: FREE, STARTER, PRO ou ENTERPRISE');
  }
  const tenantId = typeof targetTenantId === 'string' && targetTenantId ? targetTenantId : req.user!.tenantId;
  const { updateTenantPlan } = await import('../services/subscription.service.js');
  const result = await updateTenantPlan(tenantId, plan);
  res.json({ success: true, data: result });
}));

// ---------- Validação de cupom (pública) ----------

paymentsRouter.post('/validate-coupon', checkoutLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { code, plan } = req.body ?? {};
  if (!code) throw new ValidationError('Código do cupom é obrigatório');

  const coupon = await prisma.coupon.findUnique({ where: { code: String(code).trim().toUpperCase() } });
  if (!coupon) throw new ValidationError('Cupom não encontrado');
  if (!coupon.isActive) throw new ValidationError('Cupom inativo');
  if (coupon.usedCount >= coupon.maxUses) throw new ValidationError('Cupom esgotado');
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) throw new ValidationError('Cupom expirado');
  if (plan && coupon.plan !== plan) throw new ValidationError(`Cupom válido apenas para o plano ${coupon.plan}`);

  res.json({ success: true, data: { code: coupon.code, discount: coupon.discount, plan: coupon.plan } });
}));
