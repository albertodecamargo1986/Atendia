import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type JwtPayload } from '../lib/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Autenticação por access token: header `Authorization: Bearer` ou cookie httpOnly
 * `accessToken`. (Token via query string foi removido — o Socket.IO usa handshake.auth.)
 * Só aceita tokens do tipo "access" (o token temporário do 2FA é rejeitado).
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const cookieToken = req.cookies?.accessToken;

  const token = headerToken || cookieToken;

  if (!token) {
    return next(new UnauthorizedError('Token não fornecido'));
  }

  try {
    req.user = verifyAccessToken(token);
  } catch {
    return next(new UnauthorizedError('Token inválido ou expirado'));
  }
  next();
}

/** Papéis com acesso administrativo dentro do próprio tenant. */
export const TENANT_ADMIN_ROLES = ['OWNER', 'ADMIN'] as const;

/**
 * Exige um dos papéis informados. SUPER_ADMIN (dono da plataforma) sempre passa.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Não autenticado'));
    }
    if (req.user.role !== 'SUPER_ADMIN' && !roles.includes(req.user.role)) {
      return next(new ForbiddenError('Você não tem permissão para esta ação'));
    }
    next();
  };
}

/** Atalho: OWNER ou ADMIN do tenant (SUPER_ADMIN sempre passa). */
export const requireTenantAdmin = requireRole(...TENANT_ADMIN_ROLES);
