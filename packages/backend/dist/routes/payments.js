"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentsRouter = void 0;
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const zod_1 = require("zod");
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const mercadopago_service_js_1 = require("../services/mercadopago.service.js");
const mercadopago_subscription_service_js_1 = require("../services/mercadopago-subscription.service.js");
const stripe_service_js_1 = require("../services/stripe.service.js");
const errors_js_1 = require("../lib/errors.js");
const rate_limiter_js_1 = require("../middlewares/rate-limiter.js");
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
exports.paymentsRouter = (0, express_1.Router)();
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || '';
function verifyMpSignature(req) {
    if (!MP_WEBHOOK_SECRET) {
        if (process.env.NODE_ENV === 'production') {
            console.error('MP_WEBHOOK_SECRET not configured in production — rejecting webhook');
            return false;
        }
        console.warn('MP webhook: skipping signature verification (no secret, dev mode)');
        return true;
    }
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    if (!xSignature || !xRequestId)
        return false;
    // MP v2 signature format: t=timestamp,v1=hash
    const parts = xSignature.split(',');
    let timestamp = '';
    let hash = '';
    for (const part of parts) {
        const [key, value] = part.split('=');
        if (key === 't')
            timestamp = value;
        if (key === 'v1')
            hash = value;
    }
    if (!timestamp || !hash)
        return false;
    // Build the manifest: timestamp.requestId.data
    const data = JSON.stringify(req.body);
    const manifest = `${timestamp}.${xRequestId}.${data}`;
    const expectedHash = crypto_1.default.createHmac('sha256', MP_WEBHOOK_SECRET).update(manifest).digest('hex');
    return crypto_1.default.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
}
// ---------- Create checkout preference (public) ----------
const checkoutSchema = zod_1.z.object({
    name: zod_1.z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
    email: zod_1.z.string().email('Email inválido'),
    cpfCnpj: zod_1.z.string().min(11, 'CPF/CNPJ inválido').max(18),
    phone: zod_1.z.string().min(10, 'Telefone inválido'),
    plan: zod_1.z.enum(['mensal', 'trimestral', 'semestral', 'anual']),
});
exports.paymentsRouter.post('/checkout', rate_limiter_js_1.checkoutLimiter, (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errors_js_1.ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const { gateway = 'mercadopago' } = req.body;
    let result;
    if (gateway === 'stripe') {
        result = await (0, mercadopago_service_js_1.createStripeCheckoutSession)(parsed.data);
    }
    else {
        result = await (0, mercadopago_service_js_1.createPreference)(parsed.data);
    }
    res.json({ success: true, data: result });
}));
// ---------- Mercado Pago webhooks (public, called by MP) ----------
// NOTE: These routes keep their own try/catch because they must always return 200 to MP
exports.paymentsRouter.post('/webhook/mercadopago', rate_limiter_js_1.webhookLimiter, async (req, res) => {
    try {
        if (MP_WEBHOOK_SECRET && !verifyMpSignature(req)) {
            console.warn('MP webhook: invalid signature — rejecting');
            res.status(401).json({ error: 'Invalid signature' });
            return;
        }
        const result = await (0, mercadopago_service_js_1.handleMercadoPagoWebhook)(req.body);
        res.json(result);
    }
    catch (err) {
        console.error('MP webhook error:', err.message);
        res.json({ received: true });
    }
});
exports.paymentsRouter.post('/webhook/mercadopago/subscription', rate_limiter_js_1.webhookLimiter, async (req, res) => {
    try {
        if (MP_WEBHOOK_SECRET && !verifyMpSignature(req)) {
            console.warn('MP subscription webhook: invalid signature — rejecting');
            res.status(401).json({ error: 'Invalid signature' });
            return;
        }
        const result = await (0, mercadopago_subscription_service_js_1.handleSubscriptionWebhook)(req.body);
        res.json(result);
    }
    catch (err) {
        console.error('MP subscription webhook error:', err.message);
        res.json({ received: true });
    }
});
// MP also verifies with GET
exports.paymentsRouter.get('/webhook/mercadopago', (_req, res) => {
    res.json({ status: 'ok' });
});
exports.paymentsRouter.get('/webhook/mercadopago/subscription', (_req, res) => {
    res.json({ status: 'ok' });
});
// ---------- Stripe webhook (public, called by landing) ----------
exports.paymentsRouter.post('/webhook/stripe', rate_limiter_js_1.webhookLimiter, async (req, res) => {
    try {
        const result = await (0, stripe_service_js_1.handleStripeWebhook)(req.body);
        res.json(result);
    }
    catch (err) {
        console.error('Stripe webhook error:', err.message);
        res.json({ received: true });
    }
});
exports.paymentsRouter.get('/webhook/stripe', (_req, res) => {
    res.json({ status: 'ok' });
});
// ---------- My payments (tenant's own payment history) ----------
exports.paymentsRouter.get('/my-payments', auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.user.tenantId;
    const payments = await prisma_js_1.default.payment.findMany({
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
    const subscription = await prisma_js_1.default.subscription.findUnique({ where: { tenantId } });
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
exports.paymentsRouter.get('/:id/status', auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const result = await (0, mercadopago_service_js_1.getPaymentStatus)(req.params.id, req.user.tenantId);
    res.json({ success: true, data: result });
}));
// ---------- Self-service upgrade (authenticated) ----------
const PLANS_UPGRADE = ['STARTER', 'PRO', 'ENTERPRISE'];
exports.paymentsRouter.post('/upgrade-plan', auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { plan } = req.body;
    if (!plan || !PLANS_UPGRADE.includes(plan)) {
        throw new errors_js_1.ValidationError('Plano inválido. Escolha: STARTER, PRO ou ENTERPRISE');
    }
    const tenantId = req.user.tenantId;
    const userRole = req.user.role;
    if (userRole !== 'OWNER') {
        throw new errors_js_1.ValidationError('Apenas o OWNER do tenant pode fazer upgrade');
    }
    const { updateTenantPlan } = await import('../services/subscription.service.js');
    const result = await updateTenantPlan(tenantId, plan);
    res.json({ success: true, data: result });
}));
// ---------- Coupon validation (public) ----------
exports.paymentsRouter.post('/validate-coupon', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { code, plan } = req.body;
    if (!code)
        throw new errors_js_1.ValidationError('Código do cupom é obrigatório');
    const coupon = await prisma_js_1.default.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon)
        throw new errors_js_1.ValidationError('Cupom não encontrado');
    if (!coupon.isActive)
        throw new errors_js_1.ValidationError('Cupom inativo');
    if (coupon.usedCount >= coupon.maxUses)
        throw new errors_js_1.ValidationError('Cupom esgotado');
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())
        throw new errors_js_1.ValidationError('Cupom expirado');
    if (plan && coupon.plan !== plan)
        throw new errors_js_1.ValidationError(`Cupom válido apenas para plano ${coupon.plan}`);
    res.json({ success: true, data: { code: coupon.code, discount: coupon.discount, plan: coupon.plan } });
}));
//# sourceMappingURL=payments.js.map