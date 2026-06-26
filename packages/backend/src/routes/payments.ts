import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { createPreference, handleMercadoPagoWebhook, getPaymentStatus } from '../services/mercadopago.service.js';
import { ValidationError } from '../lib/errors.js';
import prisma from '../lib/prisma.js';

export const paymentsRouter = Router();

const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || '';

function verifyMpSignature(req: Request): boolean {
  if (!MP_WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('MP_WEBHOOK_SECRET not configured in production — rejecting webhook');
      return false;
    }
    console.warn('MP webhook: skipping signature verification (no secret, dev mode)');
    return true;
  }

  const xSignature = req.headers['x-signature'] as string;
  const xRequestId = req.headers['x-request-id'] as string;

  if (!xSignature || !xRequestId) return false;

  // MP v2 signature format: t=timestamp,v1=hash
  const parts = xSignature.split(',');
  let timestamp = '';
  let hash = '';

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') hash = value;
  }

  if (!timestamp || !hash) return false;

  // Build the manifest: timestamp.requestId.data
  const data = JSON.stringify(req.body);
  const manifest = `${timestamp}.${xRequestId}.${data}`;
  const expectedHash = crypto.createHmac('sha256', MP_WEBHOOK_SECRET).update(manifest).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
}

// ---------- Create checkout preference (public) ----------

const checkoutSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  cpfCnpj: z.string().min(11, 'CPF/CNPJ inválido').max(18),
  phone: z.string().min(10, 'Telefone inválido'),
  plan: z.enum(['mensal', 'trimestral', 'semestral', 'anual']),
});

paymentsRouter.post('/checkout', asyncHandler(async (req: Request, res: Response) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }

  const result = await createPreference(parsed.data);
  res.json({ success: true, data: result });
}));

// ---------- Mercado Pago webhook (public, called by MP) ----------
// NOTE: This route keeps its own try/catch because it must always return 200 to MP

paymentsRouter.post('/webhook/mercadopago', async (req: Request, res: Response) => {
  try {
    // Verify signature if secret is configured
    if (MP_WEBHOOK_SECRET && !verifyMpSignature(req)) {
      console.warn('MP webhook: invalid signature — rejecting');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const result = await handleMercadoPagoWebhook(req.body);
    res.json(result);
  } catch (err: any) {
    console.error('MP webhook error:', err.message);
    // Always return 200 to MP so it doesn't retry indefinitely
    res.json({ received: true });
  }
});

// MP also verifies with GET
paymentsRouter.get('/webhook/mercadopago', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ---------- My payments (tenant's own payment history) ----------

paymentsRouter.get('/my-payments', authMiddleware, tenantMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;

  const payments = await prisma.payment.findMany({
    where: {
      customer: { tenantId },
    },
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

// ---------- Payment status (authenticated) ----------

paymentsRouter.get('/:id/status', authMiddleware, tenantMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const result = await getPaymentStatus(req.params.id, req.user!.tenantId);
  res.json({ success: true, data: result });
}));

// ---------- Self-service upgrade (authenticated) ----------

const PLANS_UPGRADE = ['STARTER', 'PRO', 'ENTERPRISE'] as const;

paymentsRouter.post('/upgrade-plan', authMiddleware, tenantMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { plan } = req.body;
  if (!plan || !PLANS_UPGRADE.includes(plan)) {
    throw new ValidationError('Plano inválido. Escolha: STARTER, PRO ou ENTERPRISE');
  }

  const tenantId = req.user!.tenantId;
  const userRole = req.user!.role;

  if (userRole !== 'OWNER') {
    throw new ValidationError('Apenas o OWNER do tenant pode fazer upgrade');
  }

  const { updateTenantPlan } = await import('../services/subscription.service.js');
  const result = await updateTenantPlan(tenantId, plan);
  res.json({ success: true, data: result });
}));

// ---------- Coupon validation (public) ----------

paymentsRouter.post('/validate-coupon', asyncHandler(async (req: Request, res: Response) => {
  const { code, plan } = req.body;
  if (!code) throw new ValidationError('Código do cupom é obrigatório');

  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon) throw new ValidationError('Cupom não encontrado');
  if (!coupon.isActive) throw new ValidationError('Cupom inativo');
  if (coupon.usedCount >= coupon.maxUses) throw new ValidationError('Cupom esgotado');
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) throw new ValidationError('Cupom expirado');
  if (plan && coupon.plan !== plan) throw new ValidationError(`Cupom válido apenas para plano ${coupon.plan}`);

  res.json({ success: true, data: { code: coupon.code, discount: coupon.discount, plan: coupon.plan } });
}));
