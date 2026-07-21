"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTenantPlan = updateTenantPlan;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
async function updateTenantPlan(tenantId, plan) {
    const tenant = await prisma_js_1.default.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    // Busca limites do PlanConfig no banco (fallback para hardcoded se não existir)
    const limits = await getLimitsForPlan(plan);
    return prisma_js_1.default.tenant.update({
        where: { id: tenantId },
        data: {
            plan: plan,
            maxAgents: limits.maxAgents,
            maxConversations: limits.maxConversations,
            maxWhatsapp: limits.maxWhatsapp,
            maxAiRequests: limits.maxAiRequests,
        },
    });
}
async function getLimitsForPlan(plan) {
    try {
        const config = await prisma_js_1.default.planConfig.findUnique({ where: { planId: plan } });
        if (config?.limits) {
            const limits = config.limits;
            return {
                maxAgents: limits.maxAgents ?? 1,
                maxConversations: limits.maxConversations ?? 100,
                maxWhatsapp: limits.maxWhatsapp ?? 1,
                maxAiRequests: limits.maxAiRequests ?? 500,
            };
        }
    }
    catch { }
    // Fallback hardcoded
    const plans = {
        FREE: { maxAgents: 1, maxConversations: 100, maxWhatsapp: 1, maxAiRequests: 500 },
        STARTER: { maxAgents: 3, maxConversations: 1000, maxWhatsapp: 2, maxAiRequests: 5000 },
        PRO: { maxAgents: 10, maxConversations: 10000, maxWhatsapp: 5, maxAiRequests: 50000 },
        ENTERPRISE: { maxAgents: -1, maxConversations: -1, maxWhatsapp: -1, maxAiRequests: -1 },
    };
    return plans[plan] || plans.FREE;
}
//# sourceMappingURL=subscription.service.js.map