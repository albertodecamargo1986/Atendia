/**
 * Espelho do mapa plano → módulos do backend
 * (packages/backend/src/config/plans.ts — PLANS[plan].features).
 * Usado apenas para exibir cadeados no menu; quem bloqueia de verdade é o backend.
 */
export type PlanId = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';

export const PLAN_MODULES: Record<PlanId, string[]> = {
  FREE: ['dashboard', 'tickets', 'conversations', 'contacts', 'agents', 'whatsapp', 'businessHours', 'settings'],
  STARTER: [
    'dashboard', 'tickets', 'conversations', 'contacts', 'agents', 'queues',
    'tags', 'quickReplies', 'whatsapp', 'businessHours', 'team', 'settings',
  ],
  PRO: [
    'dashboard', 'tickets', 'conversations', 'contacts', 'agents', 'queues',
    'tags', 'quickReplies', 'campaigns', 'voiceProfiles', 'webhooks', 'reports',
    'internalChat', 'knowledge', 'whatsapp', 'businessHours', 'team', 'settings',
  ],
  ENTERPRISE: ['*'],
};

export const PLAN_LABELS: Record<string, string> = {
  FREE: 'Grátis',
  STARTER: 'Starter',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
};

export function hasModule(plan: string | undefined | null, module: string | undefined | null): boolean {
  if (!module) return true;
  const key = (plan || 'FREE').toUpperCase() as PlanId;
  const modules = PLAN_MODULES[key] || PLAN_MODULES.FREE;
  return modules.includes('*') || modules.includes(module);
}

/** Menor plano que libera o módulo (para a mensagem "Disponível no plano X"). */
export function minimumPlanFor(module: string): PlanId {
  const order: PlanId[] = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'];
  for (const p of order) {
    if (hasModule(p, module)) return p;
  }
  return 'ENTERPRISE';
}
