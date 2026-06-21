import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { ForbiddenError } from '../lib/errors.js';
import { hasModuleAccess, type ModuleId } from '../config/plans.js';

/**
 * Middleware que verifica se o plano do tenant tem acesso ao módulo.
 * Bloqueia requisições se o módulo não estiver no plano contratado.
 */
export function requireModule(module: ModuleId) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenantId;
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true },
      });

      if (!tenant) {
        throw new ForbiddenError('Tenant não encontrado');
      }

      if (!hasModuleAccess(tenant.plan as any, module)) {
        const messages: Record<string, string> = {
          campaigns: 'Campanhas são apenas para planos PRO ou superior.',
          voiceProfiles: 'Perfis de voz são apenas para planos PRO ou superior.',
          webhooks: 'Webhooks são apenas para planos PRO ou superior.',
          reports: 'Relatórios avançados são apenas para planos PRO ou superior.',
          internalChat: 'Chat interno é apenas para planos PRO ou superior.',
          knowledge: 'Base de conhecimento é apenas para planos PRO ou superior.',
          queues: 'Filas são apenas para planos Starter ou superior.',
          tags: 'Tags são apenas para planos Starter ou superior.',
          quickReplies: 'Respostas rápidas são apenas para planos Starter ou superior.',
          businessHours: 'Horários de funcionamento são apenas para planos Starter ou superior.',
          team: 'Gestão de equipe é apenas para planos Starter ou superior.',
          settings: 'Configurações avançadas são apenas para planos Starter ou superior.',
        };
        throw new ForbiddenError(
          messages[module] || `Módulo "${module}" não disponível no seu plano. Faça upgrade para acessar.`
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
