import { Request, Response, NextFunction } from 'express';
type ResourceKey = 'agents' | 'whatsappSessions' | 'conversations';
/**
 * Middleware que verifica se o tenant ainda pode criar o recurso.
 * Compara o limite do plano com a contagem atual no banco.
 */
export declare function enforceLimit(resource: ResourceKey): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
export {};
