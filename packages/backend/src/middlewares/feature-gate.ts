import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { ForbiddenError } from '../lib/errors.js';
import { hasModuleAccess, type ModuleId } from '../config/plans.js';

const MODULE_MESSAGES: Record<string, string> = {
  campaigns: 'Campanhas estão disponíveis a partir do plano Pro.',
  voiceProfiles: 'Perfis de voz estão disponíveis a partir do plano Pro.',
  webhooks: 'Integrações (webhooks) estão disponíveis a partir do plano Pro.',
  reports: 'Relatórios avançados estão disponíveis a partir do plano Pro.',
  internalChat: 'O chat interno está disponível a partir do plano Pro.',
  knowledge: 'A base de conhecimento está disponível a partir do plano Pro.',
  queues: 'Filas estão disponíveis a partir do plano Starter.',
  tags: 'Etiquetas estão disponíveis a partir do plano Starter.',
  quickReplies: 'Respostas rápidas estão disponíveis a partir do plano Starter.',
  businessHours: 'Horário de funcionamento está disponível a partir do plano Starter.',
  team: 'Gestão de equipe está disponível a partir do plano Starter.',
  settings: 'Configurações avançadas estão disponíveis a partir do plano Starter.',
};

/**
 * Verifica se o PLANO do tenant inclui o módulo. Vale para todos os papéis do
 * tenant (inclusive OWNER/ADMIN) — só o SUPER_ADMIN da plataforma é isento.
 */
export function requireModule(module: ModuleId) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (req.user?.role === 'SUPER_ADMIN') return next();

      const tenantId = req.user!.tenantId;
      const plan = req.tenant?.plan
        ?? (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } }))?.plan;

      if (!plan) {
        throw new ForbiddenError('Empresa não encontrada');
      }

      if (!hasModuleAccess(plan as any, module)) {
        const err = new ForbiddenError(
          MODULE_MESSAGES[module] || `O módulo "${module}" não está disponível no seu plano. Mude de plano para acessar.`,
        );
        (err as any).code = 'PLAN_REQUIRED';
        throw err;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
