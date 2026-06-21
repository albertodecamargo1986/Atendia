import prisma from '../lib/prisma.js';

export async function updateTenantPlan(tenantId: string, plan: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  // Atualiza plano e limites conforme o plano escolhido
  const limits = getLimitsForPlan(plan);

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

function getLimitsForPlan(plan: string) {
  const plans: Record<string, { maxAgents: number; maxConversations: number; maxWhatsapp: number; maxAiRequests: number }> = {
    FREE: { maxAgents: 1, maxConversations: 100, maxWhatsapp: 1, maxAiRequests: 500 },
    STARTER: { maxAgents: 3, maxConversations: 1000, maxWhatsapp: 2, maxAiRequests: 5000 },
    PRO: { maxAgents: 10, maxConversations: 10000, maxWhatsapp: 5, maxAiRequests: 50000 },
    ENTERPRISE: { maxAgents: -1, maxConversations: -1, maxWhatsapp: -1, maxAiRequests: -1 },
  };
  return plans[plan] || plans.FREE;
}
