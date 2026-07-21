import prisma from '../lib/prisma.js';

const MERCADOPAGO_API = 'https://api.mercadopago.com';

export async function getPlans() {
  return prisma.planConfig.findMany({ orderBy: { planId: 'asc' } });
}

export async function getPlan(planId: string) {
  return prisma.planConfig.findUnique({ where: { planId: planId as any } });
}

export async function updatePlan(planId: string, data: {
  name?: string;
  price?: number;
  description?: string;
  features?: string[];
  limits?: {
    maxAgents: number;
    maxWhatsapp: number;
    maxConversations: number;
    maxAiRequests: number;
    maxTeamMembers?: number;
  };
}) {
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.price !== undefined) updateData.price = data.price;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.features !== undefined) updateData.features = data.features;
  if (data.limits !== undefined) updateData.limits = data.limits;

  return prisma.planConfig.update({
    where: { planId: planId as any },
    data: updateData,
  });
}

export async function syncPlanToMercadoPago(planId: string) {
  const plan = await prisma.planConfig.findUnique({ where: { planId: planId as any } });
  if (!plan) throw new Error('Plano não encontrado');
  if (plan.price <= 0) throw new Error('Planos gratuitos não precisam ser sincronizados');

  const mpConfig = await prisma.mercadoPagoConfig.findFirst({ where: { isActive: true } });
  if (!mpConfig || !mpConfig.accessToken) throw new Error('Mercado Pago não configurado');

  // Mapear planId para o campo de ID no MP config
  const mpPlanIdMap: Record<string, string | null | undefined> = {
    STARTER: mpConfig.preapprovalPlanStarterId,
    PRO: mpConfig.preapprovalPlanProId,
    ENTERPRISE: mpConfig.preapprovalPlanEnterpriseId,
  };

  const mpPlanId = mpPlanIdMap[planId];
  if (!mpPlanId) throw new Error(`Nenhum plano do Mercado Pago configurado para ${planId}`);

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
  if (!res.ok) throw new Error(`Erro MP ao sincronizar plano: ${result.message || JSON.stringify(result)}`);

  // Audit log
  await prisma.auditLog.create({
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
