import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../lib/errors.js';
import { ZodError } from 'zod';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

function send(res: Response, status: number, code: string, message: string, requestId: string, details?: unknown) {
  const body: any = { success: false, error: { code, message }, requestId };
  if (details !== undefined) body.error.details = details;
  return res.status(status).json(body);
}

export function globalErrorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.id || 'unknown';

  if (res.headersSent) {
    logger.error({ err: err.message, requestId }, 'Erro após envio dos cabeçalhos');
    return;
  }

  // Erros de validação (Zod)
  if (err instanceof ZodError) {
    const messages = err.issues.map((i) => i.message).join('; ');
    return send(res, 422, 'VALIDATION_ERROR', messages, requestId,
      err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }

  if (err instanceof AppError && err.isOperational) {
    const details = err instanceof ValidationError && err.errors ? err.errors : undefined;
    return send(res, err.statusCode, err.code, err.message, requestId, details);
  }

  // Upload (multer)
  const anyErr = err as any;
  if (anyErr?.name === 'MulterError') {
    if (anyErr.code === 'LIMIT_FILE_SIZE') {
      return send(res, 413, 'FILE_TOO_LARGE', 'Arquivo muito grande', requestId);
    }
    return send(res, 400, 'UPLOAD_ERROR', `Erro no envio do arquivo: ${anyErr.message}`, requestId);
  }
  if (anyErr?.isUploadFilterError) {
    return send(res, 400, 'UPLOAD_ERROR', anyErr.message, requestId);
  }

  // JSON inválido no corpo
  if (anyErr?.type === 'entity.parse.failed') {
    return send(res, 400, 'INVALID_JSON', 'Corpo da requisição não é um JSON válido', requestId);
  }
  if (anyErr?.type === 'entity.too.large') {
    return send(res, 413, 'PAYLOAD_TOO_LARGE', 'Requisição muito grande', requestId);
  }

  // Prisma
  if (typeof anyErr?.code === 'string' && anyErr?.clientVersion) {
    if (anyErr.code === 'P2002') {
      return send(res, 409, 'CONFLICT', 'Já existe um registro com esses dados', requestId);
    }
    if (anyErr.code === 'P2025') {
      return send(res, 404, 'NOT_FOUND', 'Registro não encontrado', requestId);
    }
    if (anyErr.code === 'P2003') {
      return send(res, 409, 'CONFLICT', 'Registro vinculado a outros dados', requestId);
    }
  }

  // Erros HTTP de bibliotecas (ex.: express.static → 404)
  const httpStatus = typeof anyErr?.status === 'number' ? anyErr.status : anyErr?.statusCode;
  if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
    const message = httpStatus === 404 ? 'Arquivo ou rota não encontrado' : 'Requisição inválida';
    return send(res, httpStatus, httpStatus === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', message, requestId);
  }

  // Erro inesperado
  logger.error({ err: err.message, stack: err.stack, requestId }, 'Erro inesperado');
  return send(res, 500, 'INTERNAL_ERROR', 'Erro interno do servidor', requestId);
}
