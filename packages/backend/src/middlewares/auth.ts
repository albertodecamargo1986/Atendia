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

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  // Tenta de 3 fontes: header Authorization, cookie httpOnly, query param (fallback WebSocket)
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const cookieToken = req.cookies?.accessToken;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : null;

  const token = headerToken || cookieToken || queryToken;

  if (!token) {
    throw new UnauthorizedError('Token não fornecido');
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado');
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError('Não autenticado');
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError('Permissão insuficiente');
    }
    next();
  };
}
