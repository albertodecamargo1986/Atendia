import { Request, Response, NextFunction } from 'express';
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
export declare function tenantMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
