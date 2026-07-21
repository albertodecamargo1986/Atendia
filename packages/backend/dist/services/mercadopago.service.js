"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPreference = createPreference;
exports.createStripeCheckoutSession = createStripeCheckoutSession;
exports.handleMercadoPagoWebhook = handleMercadoPagoWebhook;
exports.getPaymentStatus = getPaymentStatus;
const errors_js_1 = require("../lib/errors.js");
const mercadopago_1 = require("mercadopago");
const stripe_1 = require("stripe");
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const email_js_1 = require("../lib/email.js");
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_SANDBOX_TOKEN = process.env.MP_SANDBOX_TOKEN || '';
const USE_SANDBOX = process.env.MP_SANDBOX === 'true';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const PLAN_CONFIG = {
    mensal: { name: 'AtendIA Mensal', price: 147, months: 1 },
    trimestral: { name: 'AtendIA Trimestral', price: 381, months: 3 },
    semestral: { name: 'AtendIA Semestral', price: 642, months: 6 },
    anual: { name: 'AtendIA Anual', price: 1044, months: 12 },
};
const BACKEND_URL = process.env.API_URL || 'http://localhost:3000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
function getMpClient() {
    const token = USE_SANDBOX ? MP_SANDBOX_TOKEN : MP_ACCESS_TOKEN;
    if (!token) {
        throw new errors_js_1.ValidationError('Mercado Pago access token not configured');
    }
    return new mercadopago_1.MercadoPagoConfig({ accessToken: token });
}
function getStripeClient() {
    if (!STRIPE_SECRET_KEY) {
        throw new errors_js_1.ValidationError('Stripe secret key not configured');
    }
    return new stripe_1.Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
}
// ---------- Create Payment Preference (Mercado Pago) ----------
async function createPreference(data) {
    const config = PLAN_CONFIG[data.plan];
    if (!config) {
        throw new errors_js_1.ValidationError(`Plano inválido: ${data.plan}`);
    }
    let customer = await prisma_js_1.default.customer.findFirst({ where: { email: data.email } });
    if (!customer) {
        customer = await prisma_js_1.default.customer.create({
            data: {
                name: data.name,
                email: data.email,
                cpfCnpj: data.cpfCnpj,
                phone: data.phone,
            },
        });
    }
    else {
        customer = await prisma_js_1.default.customer.update({
            where: { id: customer.id },
            data: { name: data.name, cpfCnpj: data.cpfCnpj, phone: data.phone },
        });
    }
    const payment = await prisma_js_1.default.payment.create({
        data: {
            customerId: customer.id,
            gateway: 'MERCADOPAGO',
            amount: config.price,
            plan: data.plan,
            periodMonths: config.months,
            status: 'PENDING',
        },
    });
    const preference = new mercadopago_1.Preference(getMpClient());
    const result = await preference.create({
        body: {
            items: [
                {
                    id: payment.id,
                    title: config.name,
                    description: `Assinatura AtendIA - Plano ${config.name}`,
                    quantity: 1,
                    unit_price: config.price,
                    currency_id: 'BRL',
                },
            ],
            payer: {
                name: data.name,
                email: data.email,
                identification: {
                    type: data.cpfCnpj.length <= 14 ? 'CPF' : 'CNPJ',
                    number: data.cpfCnpj.replace(/\D/g, ''),
                },
            },
            back_urls: {
                success: `${FRONTEND_URL}/admin/payments?status=success`,
                failure: `${FRONTEND_URL}/admin/payments?status=failure`,
                pending: `${FRONTEND_URL}/admin/payments?status=pending`,
            },
            auto_return: 'approved',
            external_reference: payment.id,
            notification_url: `${BACKEND_URL}/payments/webhook/mercadopago`,
            metadata: {
                payment_id: payment.id,
                plan: data.plan,
            },
        },
    });
    await prisma_js_1.default.payment.update({
        where: { id: payment.id },
        data: { mercadopagoPreferenceId: result.id },
    });
    return {
        preferenceId: result.id,
        initPoint: result.init_point,
        sandboxInitPoint: result.sandbox_init_point,
        paymentId: payment.id,
    };
}
// ---------- Create Stripe Checkout Session ----------
async function createStripeCheckoutSession(data) {
    const config = PLAN_CONFIG[data.plan];
    if (!config) {
        throw new errors_js_1.ValidationError(`Plano inválido: ${data.plan}`);
    }
    let customer = await prisma_js_1.default.customer.findFirst({ where: { email: data.email } });
    if (!customer) {
        customer = await prisma_js_1.default.customer.create({
            data: {
                name: data.name,
                email: data.email,
                cpfCnpj: data.cpfCnpj,
                phone: data.phone,
            },
        });
    }
    else {
        customer = await prisma_js_1.default.customer.update({
            where: { id: customer.id },
            data: { name: data.name, cpfCnpj: data.cpfCnpj, phone: data.phone },
        });
    }
    const payment = await prisma_js_1.default.payment.create({
        data: {
            customerId: customer.id,
            gateway: 'STRIPE',
            amount: config.price,
            plan: data.plan,
            periodMonths: config.months,
            status: 'PENDING',
        },
    });
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: data.email,
        metadata: {
            payment_id: payment.id,
            plan: data.plan,
        },
        line_items: [
            {
                price_data: {
                    currency: 'brl',
                    product_data: {
                        name: config.name,
                        description: `Assinatura AtendIA - Plano ${config.name}`,
                    },
                    unit_amount: Math.round(config.price * 100), // Stripe uses cents
                },
                quantity: 1,
            },
        ],
        success_url: `${FRONTEND_URL}/checkout?status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/checkout?status=cancelled`,
    });
    await prisma_js_1.default.payment.update({
        where: { id: payment.id },
        data: { mercadopagoPreferenceId: session.id }, // reusing field for stripe session id
    });
    return {
        sessionId: session.id,
        url: session.url,
        paymentId: payment.id,
    };
}
// ---------- Handle Mercado Pago Webhook ----------
async function handleMercadoPagoWebhook(body) {
    const { type, action, data } = body;
    if (type === 'payment' && data?.id) {
        const mpPaymentId = data.id.toString();
        if (action === 'payment.approved') {
            await approvePaymentByMpId(mpPaymentId, body);
        }
        else if (action === 'payment.rejected' || action === 'payment.cancelled') {
            await rejectPaymentByMpId(mpPaymentId, body);
        }
        else if (action === 'payment.refunded' || action === 'chargebacks') {
            await refundPaymentByMpId(mpPaymentId, body);
        }
        return { processed: true };
    }
    if (type === 'merchant_order') {
        return { processed: true, type: 'merchant_order' };
    }
    return { processed: false, type };
}
async function findPaymentByMpId(mpPaymentId, body) {
    let payment = await prisma_js_1.default.payment.findFirst({
        where: { gateway: 'MERCADOPAGO', gatewayTransactionId: mpPaymentId },
    });
    if (payment)
        return payment;
    const externalRef = body?.external_reference;
    if (externalRef) {
        payment = await prisma_js_1.default.payment.findUnique({
            where: { id: externalRef },
        });
        if (payment && payment.gateway === 'MERCADOPAGO')
            return payment;
    }
    const preferenceId = body?.data?.preference_id || body?.preference_id;
    if (preferenceId) {
        payment = await prisma_js_1.default.payment.findFirst({
            where: { gateway: 'MERCADOPAGO', mercadopagoPreferenceId: preferenceId },
        });
        if (payment)
            return payment;
    }
    return null;
}
async function approvePaymentByMpId(mpPaymentId, body) {
    const payment = await findPaymentByMpId(mpPaymentId, body);
    if (!payment) {
        console.warn(`MP webhook: payment not found for mpPaymentId=${mpPaymentId}`);
        return;
    }
    if (payment.status === 'APPROVED')
        return;
    await prisma_js_1.default.payment.update({
        where: { id: payment.id },
        data: {
            status: 'APPROVED',
            paidAt: new Date(),
            mercadopagoStatus: 'approved',
            gatewayTransactionId: mpPaymentId,
        },
    });
    // Update/create subscription for the customer's tenant
    if (payment.customerId) {
        const customer = await prisma_js_1.default.customer.findUnique({
            where: { id: payment.customerId },
            select: { tenantId: true },
        });
        if (customer?.tenantId) {
            const periodEnd = new Date();
            periodEnd.setMonth(periodEnd.getMonth() + (payment.periodMonths || 1));
            await prisma_js_1.default.subscription.upsert({
                where: { tenantId: customer.tenantId },
                create: {
                    tenantId: customer.tenantId,
                    status: 'ACTIVE',
                    currentPeriodEnd: periodEnd,
                },
                update: {
                    status: 'ACTIVE',
                    currentPeriodEnd: periodEnd,
                },
            });
            // Reactivate tenant if inactive due to non-payment
            await prisma_js_1.default.tenant.updateMany({
                where: { id: customer.tenantId, isActive: false },
                data: { isActive: true },
            });
            // Send welcome email
            try {
                const tenant = await prisma_js_1.default.tenant.findUnique({
                    where: { id: customer.tenantId },
                    select: { name: true },
                });
                const customerData = await prisma_js_1.default.customer.findUnique({
                    where: { id: payment.customerId },
                    select: { email: true, name: true },
                });
                if (tenant && customerData) {
                    await (0, email_js_1.sendWelcomeEmail)(customerData.email, customerData.name, tenant.name);
                }
            }
            catch (emailErr) {
                console.error('Failed to send welcome email:', emailErr);
            }
        }
    }
}
async function rejectPaymentByMpId(mpPaymentId, body) {
    const payment = await findPaymentByMpId(mpPaymentId, body);
    if (!payment)
        return;
    await prisma_js_1.default.payment.update({
        where: { id: payment.id },
        data: {
            status: 'REJECTED',
            mercadopagoStatus: 'rejected',
            gatewayTransactionId: mpPaymentId,
        },
    });
}
async function refundPaymentByMpId(mpPaymentId, body) {
    const payment = await findPaymentByMpId(mpPaymentId, body);
    if (!payment)
        return;
    await prisma_js_1.default.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED', mercadopagoStatus: 'refunded', gatewayTransactionId: mpPaymentId },
    });
}
// ---------- Check Payment Status ----------
async function getPaymentStatus(paymentId, tenantId) {
    const payment = await prisma_js_1.default.payment.findUnique({
        where: { id: paymentId },
        include: {
            customer: { select: { tenantId: true } },
        },
    });
    if (!payment) {
        throw new errors_js_1.NotFoundError('Pagamento', paymentId);
    }
    if (payment.customer.tenantId && payment.customer.tenantId !== tenantId) {
        throw new errors_js_1.ForbiddenError('Acesso negado');
    }
    return {
        id: payment.id,
        status: payment.status,
        plan: payment.plan,
        amount: payment.amount,
        createdAt: payment.createdAt,
        paidAt: payment.paidAt,
    };
}
//# sourceMappingURL=mercadopago.service.js.map