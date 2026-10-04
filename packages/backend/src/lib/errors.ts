export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, code: string, statusCode: number, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    // "Sessão não encontrada", "Contato não encontrado"
    const primeira = resource.trim().split(/\s+/)[0].toLowerCase();
    const feminino = /(a|ão|ade|agem)$/.test(primeira) || ['chave'].includes(primeira);
    super(`${resource} não ${feminino ? 'encontrada' : 'encontrado'}: ${id}`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  public readonly errors?: string[];
  constructor(message: string, errors?: string[]) {
    super(message, 'VALIDATION_ERROR', 422);
    this.errors = errors;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class LimitError extends AppError {
  constructor(message: string) {
    super(message, 'LIMIT_ERROR', 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

/** Erro de filtro de upload (tipo de arquivo não permitido) — vira 400 no error-handler. */
export function uploadFilterError(message: string): Error {
  const err = new Error(message) as Error & { isUploadFilterError: boolean };
  err.isUploadFilterError = true;
  return err;
}
