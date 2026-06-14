import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../lib/errors.js';
import { ZodError } from 'zod';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export function globalErrorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.id || 'unknown';

  // Handle Zod validation errors — convert to our ValidationError
  if (err instanceof ZodError) {
    const messages = err.issues.map((i) => i.message).join('; ');
    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: messages,
        details: err.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
      requestId,
    });
  }

  if (err instanceof AppError && err.isOperational) {
    const body: any = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
      requestId,
    };

    if (err instanceof ValidationError && err.errors) {
      body.error.details = err.errors;
    }

    return res.status(err.statusCode).json(body);
  }

  // Unexpected/programming error
  logger.error({ err: err.message, stack: err.stack, requestId }, 'Unexpected error');

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
    },
    requestId,
  });
}
