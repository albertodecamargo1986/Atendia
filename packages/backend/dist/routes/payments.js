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
const errors_js_1 = require("../lib/errors.js");
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
exports.paymentsRouter.post('/checkout', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errors_js_1.ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const result = await (0, mercadopago_service_js_1.createPreference)(parsed.data);
    res.json({ success: true, data: result });
}));
// ---------- Mercado Pago webhook (public, called by MP) ----------
// NOTE: This route keeps its own try/catch because it must always return 200 to MP
exports.paymentsRouter.post('/webhook/mercadopago', async (req, res) => {
    try {
        // Verify signature if secret is configured
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
        // Always return 200 to MP so it doesn't retry indefinitely
        res.json({ received: true });
    }
});
// MP also verifies with GET
exports.paymentsRouter.get('/webhook/mercadopago', (_req, res) => {
    res.json({ status: 'ok' });
});
// ---------- Payment status (authenticated) ----------
exports.paymentsRouter.get('/:id/status', auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const result = await (0, mercadopago_service_js_1.getPaymentStatus)(req.params.id, req.user.tenantId);
    res.json({ success: true, data: result });
}));
//# sourceMappingURL=payments.js.map