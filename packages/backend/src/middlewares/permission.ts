import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { ForbiddenError } from '../lib/errors.js';

type PermissionAction = 'read' | 'write' | 'delete';

const actionFieldMap: Record<PermissionAction, keyof import('@prisma/client').Prisma.PermissionCreateInput> = {
  read: 'canRead',
  write: 'canWrite',
  delete: 'canDelete',
};

export function requirePermission(module: string, action: PermissionAction = 'read') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenError('Não autenticado'));
    }

    // OWNER e ADMIN sempre tem acesso total (bypass para evitar lentidão)
    if (req.user.role === 'OWNER' || req.user.role === 'ADMIN') {
      return next();
    }

    try {
      const permission = await prisma.permission.findUnique({
        where: {
          tenantId_role_module: {
            tenantId: req.user.tenantId,
            role: req.user.role as any,
            module,
          },
        },
      });

      if (!permission) {
        return next(new ForbiddenError(`Sem permissão para acessar ${module}`));
      }

      const field = actionFieldMap[action];
      if (!permission[field as keyof typeof permission]) {
        return next(new ForbiddenError(`Sem permissão de ${action} em ${module}`));
      }

      next();
    } catch {
      return next(new ForbiddenError('Erro ao verificar permissão'));
    }
  };
}
