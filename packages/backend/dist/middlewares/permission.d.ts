import { Request, Response, NextFunction } from 'express';
type PermissionAction = 'read' | 'write' | 'delete';
export declare function requirePermission(module: string, action?: PermissionAction): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
export {};
