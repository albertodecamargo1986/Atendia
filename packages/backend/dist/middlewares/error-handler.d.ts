import { Request, Response, NextFunction } from 'express';
export declare function globalErrorHandler(err: Error, req: Request, res: Response, _next: NextFunction): Response<any, Record<string, any>> | undefined;
