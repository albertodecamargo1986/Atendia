import { Request, Response, NextFunction } from 'express';
import { heartbeat } from '../services/online.service.js';

export function onlineHeartbeat(req: Request, _res: Response, next: NextFunction) {
  if (req.user) {
    const userId = req.user.sub;
    const tenantId = req.user.tenantId;
    // Não precisa await — fire-and-forget
    heartbeat(userId, tenantId).catch(() => {});
  }
  next();
}
