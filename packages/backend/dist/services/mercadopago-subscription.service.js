"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testToken = testToken;
exports.createPreapprovalPlan = createPreapprovalPlan;
exports.createSubscription = createSubscription;
exports.handleSubscriptionWebhook = handleSubscriptionWebhook;
exports.setupAllPlans = setupAllPlans;
exports.saveConfig = saveConfig;
exports.getStatus = getStatus;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const MERCADOPAGO_API = 'https://api.mercadopago.com';
async function mpFetch(token, path, options = {}) {
    const url = `${MERCADOPAGO_API}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    const data = await res.json();
    if (!res.ok)
        throw new Error(`MP API error ${res.status}: ${data.message || JSON.stringify(data)}`);
    return data;
}
/* ── Testar token ── */
async function testToken(token) {
    const data = await mpFetch(token, '/users/me');
    return {
        valid: true,
        id: data.id,
        name: data.nickname,
        email: data.email,
    };
}
/* ── Criar Preapproval Plan (plano recorrente) ── */
async function createPreapprovalPlan(token, plan) {
    const body = {
        reason: plan.name,
        description: plan.description,
        auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: plan.price,
            currency_id: 'BRL',
        },
        back_url: plan.successUrl,
        status: 'active',
    };
    return mpFetch(token, '/preapproval_plan', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
/* ── Criar assinatura para um cliente ── */
async function createSubscription(token, data) {
    const body = {
        preapproval_plan_id: data.preapprovalPlanId,
        payer_email: data.payerEmail,
        reason: `AtendIA - ${data.plan}`,
        status: 'pending',
    };
    if (data.cardTokenId) {
        body.card_token_id = data.cardTokenId;
    }
    return mpFetch(token, '/preapproval', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
/* ── Tratar webhook de assinatura ── */
async function handleSubscriptionWebhook(body) {
    const { type, data } = body;
    if (type === 'payment') {
        const payment = data;
        return { received: true, type: 'payment' };
    }
    if (type === 'subscription_preapproval' || type === 'subscription_authorized_payment') {
        const mpSubscriptionId = data.id?.toString();
        const config = await prisma_js_1.default.mercadoPagoConfig.findFirst({ where: { isActive: true } });
        if (!config)
            return { received: true, error: 'no_active_config' };
        // Buscar detalhes da assinatura no MP
        const sub = await mpFetch(config.accessToken, `/preapproval/${mpSubscriptionId}`);
        // Mapear o plano pelo preapproval_plan_id
        let plan = 'STARTER';
        if (sub.preapproval_plan_id === config.preapprovalPlanProId)
            plan = 'PRO';
        else if (sub.preapproval_plan_id === config.preapprovalPlanEnterpriseId)
            plan = 'ENTERPRISE';
        // Tentar encontrar tenant pelo email do pagador
        const tenant = await prisma_js_1.default.tenant.findFirst({
            where: { users: { some: { email: sub.payer_email } } },
        });
        if (!tenant)
            return { received: true, error: 'tenant_not_found' };
        // Atualizar subscription no banco
        await prisma_js_1.default.subscription.upsert({
            where: { tenantId: tenant.id },
            create: { tenantId: tenant.id, mercadopagoId: mpSubscriptionId, status: 'ACTIVE' },
            update: { mercadopagoId: mpSubscriptionId, status: 'ACTIVE' },
        });
        // Atualizar plano do tenant
        if (sub.status === 'authorized') {
            const { updateTenantPlan } = await import('./subscription.service.js');
            await updateTenantPlan(tenant.id, plan);
        }
        return { received: true, plan, status: sub.status };
    }
    return { received: true, type: 'unknown' };
}
/* ── Setup completo de planos (wizard) ── */
async function setupAllPlans(token) {
    const successUrl = process.env.FRONTEND_URL || 'https://app.atendia.com.br';
    const plans = [
        { id: 'STARTER', name: 'AtendIA - Plano Starter', price: 147, description: 'Para pequenos negócios' },
        { id: 'PRO', name: 'AtendIA - Plano Pro', price: 381, description: 'Para equipes em crescimento' },
        { id: 'ENTERPRISE', name: 'AtendIA - Plano Enterprise', price: 1044, description: 'Solução completa e ilimitada' },
    ];
    const created = [];
    for (const plan of plans) {
        const mpPlan = await createPreapprovalPlan(token, { ...plan, successUrl: `${successUrl}/upgrade` });
        created.push({ plan: plan.id, mpPlanId: mpPlan.id, mpPlan });
    }
    return created;
}
/* ── Salvar config MP ── */
async function saveConfig(tenantId, data) {
    return prisma_js_1.default.mercadoPagoConfig.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
    });
}
/* ── Status da integração ── */
async function getStatus(tenantId) {
    const config = await prisma_js_1.default.mercadoPagoConfig.findUnique({ where: { tenantId } });
    if (!config)
        return { configured: false };
    return {
        configured: config.isActive,
        currentPlanId: config.tenantId,
        preapprovalPlanStarterId: config.preapprovalPlanStarterId,
        preapprovalPlanProId: config.preapprovalPlanProId,
        preapprovalPlanEnterpriseId: config.preapprovalPlanEnterpriseId,
        isSandbox: config.isSandbox,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
    };
}
//# sourceMappingURL=mercadopago-subscription.service.js.map