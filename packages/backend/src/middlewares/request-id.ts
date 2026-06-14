import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  req.id = req.headers['x-request-id'] as string || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
