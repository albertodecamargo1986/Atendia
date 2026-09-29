import { Request, Response, NextFunction } from 'express';
import { heartbeat } from '../services/online.service.js';

/**
 * Marca o usuário como online. Registrado antes das rotas, mas só age DEPOIS da
 * autenticação: o heartbeat roda quando a resposta termina e `req.user` já foi
 * preenchido pelo authMiddleware de cada router (requisições anônimas são ignoradas).
 */
export function onlineHeartbeat(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {
    if (req.user && res.statusCode < 400) {
      heartbeat(req.user.sub, req.user.tenantId).catch(() => {});
    }
  });
  next();
}
