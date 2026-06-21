import { Request, Response, NextFunction } from 'express';
interface PlanLimits {
    maxAgents: number;
    maxConversations: number;
    maxWhatsapp: number;
    maxAiRequests: number;
}
export declare function getPlanLimits(plan: string): PlanLimits;
/**
 * Checks if tenant is within plan limits before allowing resource creation.
 */
export declare function enforcePlanLimit(resource: 'agents' | 'conversations' | 'whatsapp' | 'ai'): (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Middleware that checks if the tenant has an active license/subscription.
 * Only enforced on production. In development, it's skipped.
 */
export declare function licenseCheckMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
export {};
