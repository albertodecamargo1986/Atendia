import prisma from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import { z } from 'zod';

export interface OnboardingProgress {
  steps: {
    company: boolean;
    whatsapp: boolean;
    aiKey: boolean;
    agent: boolean;
    businessHours: boolean;
  };
  completed: boolean;
  completedAt: string | null;
}

/**
 * Progresso do assistente de configuração inicial, calculado a partir do banco
 * (contrato: GET /api/onboarding/progress).
 */
export async function getOnboardingProgress(tenantId: string): Promise<OnboardingProgress> {
  const [tenant, connectedSessions, tenantAiKeys, activeAgents, businessHours] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, onboardingCompletedAt: true } }),
    prisma.whatsAppSession.count({ where: { tenantId, status: 'CONNECTED' } }),
    prisma.tenantApiKey.count({ where: { tenantId, provider: { in: ['OPENAI', 'ANTHROPIC'] } } }),
    prisma.agent.count({ where: { tenantId, isActive: true } }),
    prisma.businessHour.count({ where: { tenantId } }),
  ]);

  if (!tenant) throw new NotFoundError('Empresa', tenantId);

  const hasGlobalAiKey = !!(process.env.OPENAI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim());

  return {
    steps: {
      company: tenant.name.trim().length >= 2,
      whatsapp: connectedSessions > 0,
      aiKey: tenantAiKeys > 0 || hasGlobalAiKey,
      agent: activeAgents > 0,
      businessHours: businessHours > 0,
    },
    completed: !!tenant.onboardingCompletedAt,
    completedAt: tenant.onboardingCompletedAt ? tenant.onboardingCompletedAt.toISOString() : null,
  };
}

/** Marca o assistente como concluído/pulado (grava Tenant.onboardingCompletedAt). */
export async function markOnboardingDone(tenantId: string): Promise<OnboardingProgress> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { onboardingCompletedAt: new Date() },
  });
  return getOnboardingProgress(tenantId);
}

const companySchema = z.object({
  name: z.string().trim().min(2, 'Nome da empresa deve ter no mínimo 2 caracteres').max(100),
});

/** Passo "Dados da empresa": atualiza o nome do tenant. */
export async function updateCompany(tenantId: string, data: unknown) {
  const { name } = companySchema.parse(data ?? {});
  return prisma.tenant.update({
    where: { id: tenantId },
    data: { name },
    select: { id: true, name: true, slug: true, plan: true, onboardingCompletedAt: true },
  });
}
