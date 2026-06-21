import { Request, Response, NextFunction } from 'express';
import { type JwtPayload } from '../lib/jwt.js';
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}
export declare function authMiddleware(req: Request, _res: Response, next: NextFunction): void;
export declare function requireRole(...roles: string[]): (req: Request, _res: Response, next: NextFunction) => void;
