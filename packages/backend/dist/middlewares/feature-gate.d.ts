import { Request, Response, NextFunction } from 'express';
import { type ModuleId } from '../config/plans.js';
/**
 * Middleware que verifica se o plano do tenant tem acesso ao módulo.
 * Bloqueia requisições se o módulo não estiver no plano contratado.
 */
export declare function requireModule(module: ModuleId): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
