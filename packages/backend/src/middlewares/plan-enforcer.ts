import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { ForbiddenError } from '../lib/errors.js';

type ResourceKey = 'agents' | 'whatsappSessions' | 'conversations';

const LIMIT_MAP: Record<ResourceKey, { field: keyof import('@prisma/client').Tenant; countField?: string }> = {
  agents: { field: 'maxAgents' },
  whatsappSessions: { field: 'maxWhatsapp' },
  conversations: { field: 'maxConversations' },
};

/**
 * Middleware que verifica se o tenant ainda pode criar o recurso.
 * Compara o limite do plano com a contagem atual no banco.
 */
export function enforceLimit(resource: ResourceKey) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenantId;
      const config = LIMIT_MAP[resource];
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { [config.field]: true },
      });

      if (!tenant) {
        throw new ForbiddenError('Tenant não encontrado');
      }

      const limit = Number(tenant[config.field]) || 0;

      // -1 = ilimitado
      if (limit === -1) return next();

      const currentCount = await (prisma as any)[resource].count({
        where: { tenantId },
      });

      if (currentCount >= limit) {
        const limitLabel: Record<ResourceKey, string> = {
          agents: 'agentes',
          whatsappSessions: 'sessões WhatsApp',
          conversations: 'conversações',
        };
        throw new ForbiddenError(
          `Limite de ${limitLabel[resource]} atingido (${limit}). Faça upgrade do seu plano para continuar.`
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
