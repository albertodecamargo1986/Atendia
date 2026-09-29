import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      tenant?: {
        id: string;
        name: string;
        plan: string;
        isActive: boolean;
      };
    }
  }
}

export async function tenantMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user?.tenantId) {
      throw new UnauthorizedError('Empresa não informada');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user.tenantId },
    });

    if (!tenant || !tenant.isActive) {
      throw new ForbiddenError('Empresa não encontrada ou inativa');
    }

    req.tenantId = tenant.id;
    req.tenant = {
      id: tenant.id,
      name: tenant.name,
      plan: tenant.plan,
      isActive: tenant.isActive,
    };

    next();
  } catch (err) {
    next(err);
  }
}
