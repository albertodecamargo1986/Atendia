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
    super(`${resource} não encontrado: ${id}`, 'NOT_FOUND', 404);
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

export class LicenseError extends AppError {
  constructor(message: string) {
    super(message, 'LICENSE_ERROR', 403);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Limite de requisições atingido') {
    super(message, 'RATE_LIMIT', 429);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export class PaymentRequiredError extends AppError {
  constructor(message: string) {
    super(message, 'PAYMENT_REQUIRED', 402);
  }
}
