import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { ForbiddenError, PaymentRequiredError } from '../lib/errors.js';

interface PlanLimits {
  maxAgents: number;
  maxConversations: number;
  maxWhatsapp: number;
  maxAiRequests: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  FREE: { maxAgents: 1, maxConversations: 100, maxWhatsapp: 1, maxAiRequests: 500 },
  STARTER: { maxAgents: 3, maxConversations: 500, maxWhatsapp: 2, maxAiRequests: 2000 },
  PRO: { maxAgents: 10, maxConversations: 5000, maxWhatsapp: 5, maxAiRequests: 10000 },
  ENTERPRISE: { maxAgents: 999, maxConversations: 99999, maxWhatsapp: 999, maxAiRequests: 99999 },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;
}

/**
 * Checks if tenant is within plan limits before allowing resource creation.
 */
export function enforcePlanLimit(resource: 'agents' | 'conversations' | 'whatsapp' | 'ai') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenError('Tenant não identificado.');
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new ForbiddenError('Tenant não encontrado.');
    }

    const limits: PlanLimits = {
      maxAgents: tenant.maxAgents || getPlanLimits(tenant.plan).maxAgents,
      maxConversations: tenant.maxConversations || getPlanLimits(tenant.plan).maxConversations,
      maxWhatsapp: tenant.maxWhatsapp || getPlanLimits(tenant.plan).maxWhatsapp,
      maxAiRequests: tenant.maxAiRequests || getPlanLimits(tenant.plan).maxAiRequests,
    };

    let currentCount = 0;
    let maxAllowed = 0;
    let resourceName = '';

    switch (resource) {
      case 'agents':
        currentCount = await prisma.agent.count({ where: { tenantId } });
        maxAllowed = limits.maxAgents;
        resourceName = 'agentes de IA';
        break;

      case 'conversations':
        currentCount = await prisma.conversation.count({
          where: { tenantId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
        });
        maxAllowed = limits.maxConversations;
        resourceName = 'conversas ativas';
        break;

      case 'whatsapp':
        currentCount = await prisma.whatsAppSession.count({ where: { tenantId } });
        maxAllowed = limits.maxWhatsapp;
        resourceName = 'sessões WhatsApp';
        break;

      case 'ai': {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        let usage = await prisma.aiUsageMonthly.findUnique({
          where: { tenantId_year_month: { tenantId, year, month } },
        });

        if (!usage) {
          usage = await prisma.aiUsageMonthly.create({
            data: { tenantId, year, month, requestCount: 0 },
          });
        }

        currentCount = usage.requestCount;
        maxAllowed = limits.maxAiRequests;
        resourceName = 'requisições de IA';
        break;
      }
    }

    if (currentCount >= maxAllowed) {
      throw new ForbiddenError(
        `Limite do plano atingido. Seu plano permite até ${maxAllowed} ${resourceName}. Considere fazer upgrade.`
      );
    }

    next();
  };
}

/**
 * Middleware that checks if the tenant has an active license/subscription.
 * Only enforced on production. In development, it's skipped.
 */
export async function licenseCheckMiddleware(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'development') {
    next();
    return;
  }

  const tenantId = req.tenantId || req.user?.tenantId;
  if (!tenantId) {
    next();
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: true },
  });

  if (!tenant) {
    next();
    return;
  }

  // FREE plan doesn't need a subscription
  if (tenant.plan === 'FREE') {
    next();
    return;
  }

  // Check if subscription is active
  if (tenant.subscription?.status !== 'ACTIVE') {
    throw new PaymentRequiredError('Assinatura expirada ou inativa. Renove sua licença para continuar.');
  }

  // Check if current period hasn't ended
  if (tenant.subscription.currentPeriodEnd && new Date(tenant.subscription.currentPeriodEnd) < new Date()) {
    throw new PaymentRequiredError('Período da assinatura expirado. Renove para continuar.');
  }

  next();
}
