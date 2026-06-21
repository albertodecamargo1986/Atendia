import { Request, Response, NextFunction } from 'express';
type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;
export declare function asyncHandler(fn: AsyncRequestHandler): (req: Request, res: Response, next: NextFunction) => void;
export {};
