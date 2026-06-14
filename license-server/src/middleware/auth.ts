import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt';

// Extend Express Request to carry the decoded token payload
declare global {
  namespace Express {
    interface Request {
      licensePayload?: TokenPayload;
    }
  }
}

/**
 * Middleware that verifies the JWT token on protected endpoints.
 * Expects the token in the Authorization header as "Bearer <token>"
 * or in the request body as { token }.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    let token: string | undefined;

    // Try Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // Fallback to body token field
    if (!token && req.body?.token) {
      token = req.body.token;
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required. Provide a valid token.',
      });
      return;
    }

    const payload = verifyToken(token);
    req.licensePayload = payload;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: 'Token expired.',
      });
      return;
    }
    if (err.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        error: 'Invalid token.',
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: 'Token verification failed.',
    });
  }
}
