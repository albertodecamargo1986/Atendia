import prisma from '../lib/prisma.js';

export async function updateTenantPlan(tenantId: string, plan: string) {
  // Garante que o tenant existe (lança se não existir)
  await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  // Busca limites do PlanConfig no banco (fallback para hardcoded se não existir)
  const limits = await getLimitsForPlan(plan);

  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      plan: plan as any,
      maxAgents: limits.maxAgents,
      maxConversations: limits.maxConversations,
      maxWhatsapp: limits.maxWhatsapp,
      maxAiRequests: limits.maxAiRequests,
    },
  });
}

async function getLimitsForPlan(plan: string) {
  try {
    const config = await prisma.planConfig.findUnique({ where: { planId: plan as any } });
    if (config?.limits) {
      const limits = config.limits as any;
      return {
        maxAgents: limits.maxAgents ?? 1,
        maxConversations: limits.maxConversations ?? 100,
        maxWhatsapp: limits.maxWhatsapp ?? 1,
        maxAiRequests: limits.maxAiRequests ?? 500,
      };
    }
  } catch {}
  // Fallback hardcoded
  const plans: Record<string, { maxAgents: number; maxConversations: number; maxWhatsapp: number; maxAiRequests: number }> = {
    FREE: { maxAgents: 1, maxConversations: 100, maxWhatsapp: 1, maxAiRequests: 500 },
    STARTER: { maxAgents: 3, maxConversations: 1000, maxWhatsapp: 2, maxAiRequests: 5000 },
    PRO: { maxAgents: 10, maxConversations: 10000, maxWhatsapp: 5, maxAiRequests: 50000 },
    ENTERPRISE: { maxAgents: -1, maxConversations: -1, maxWhatsapp: -1, maxAiRequests: -1 },
  };
  return plans[plan] || plans.FREE;
}
