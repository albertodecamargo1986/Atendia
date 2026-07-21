"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlans = getPlans;
exports.getPlan = getPlan;
exports.updatePlan = updatePlan;
exports.syncPlanToMercadoPago = syncPlanToMercadoPago;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const MERCADOPAGO_API = 'https://api.mercadopago.com';
async function getPlans() {
    return prisma_js_1.default.planConfig.findMany({ orderBy: { planId: 'asc' } });
}
async function getPlan(planId) {
    return prisma_js_1.default.planConfig.findUnique({ where: { planId: planId } });
}
async function updatePlan(planId, data) {
    const updateData = {};
    if (data.name !== undefined)
        updateData.name = data.name;
    if (data.price !== undefined)
        updateData.price = data.price;
    if (data.description !== undefined)
        updateData.description = data.description;
    if (data.features !== undefined)
        updateData.features = data.features;
    if (data.limits !== undefined)
        updateData.limits = data.limits;
    return prisma_js_1.default.planConfig.update({
        where: { planId: planId },
        data: updateData,
    });
}
async function syncPlanToMercadoPago(planId) {
    const plan = await prisma_js_1.default.planConfig.findUnique({ where: { planId: planId } });
    if (!plan)
        throw new Error('Plano não encontrado');
    if (plan.price <= 0)
        throw new Error('Planos gratuitos não precisam ser sincronizados');
    const mpConfig = await prisma_js_1.default.mercadoPagoConfig.findFirst({ where: { isActive: true } });
    if (!mpConfig || !mpConfig.accessToken)
        throw new Error('Mercado Pago não configurado');
    // Mapear planId para o campo de ID no MP config
    const mpPlanIdMap = {
        STARTER: mpConfig.preapprovalPlanStarterId,
        PRO: mpConfig.preapprovalPlanProId,
        ENTERPRISE: mpConfig.preapprovalPlanEnterpriseId,
    };
    const mpPlanId = mpPlanIdMap[planId];
    if (!mpPlanId)
        throw new Error(`Nenhum plano do Mercado Pago configurado para ${planId}`);
    const url = `${MERCADOPAGO_API}/preapproval_plan/${mpPlanId}`;
    const res = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${mpConfig.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            auto_recurring: {
                transaction_amount: plan.price,
                currency_id: 'BRL',
            },
            reason: plan.name,
        }),
    });
    const result = await res.json();
    if (!res.ok)
        throw new Error(`Erro MP ao sincronizar plano: ${result.message || JSON.stringify(result)}`);
    // Audit log
    await prisma_js_1.default.auditLog.create({
        data: {
            tenantId: mpConfig.tenantId,
            action: 'PLAN_SYNCED_TO_MERCADOPAGO',
            entity: 'PlanConfig',
            entityId: planId,
            details: { planId, price: plan.price, mpPlanId },
        },
    });
    return { success: true, mpPlanId, price: plan.price };
}
//# sourceMappingURL=plan-config.service.js.map