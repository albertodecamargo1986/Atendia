"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentRequiredError = exports.ConflictError = exports.RateLimitError = exports.LicenseError = exports.ForbiddenError = exports.UnauthorizedError = exports.ValidationError = exports.NotFoundError = exports.AppError = void 0;
class AppError extends Error {
    code;
    statusCode;
    isOperational;
    constructor(message, code, statusCode, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class NotFoundError extends AppError {
    constructor(resource, id) {
        super(`${resource} não encontrado: ${id}`, 'NOT_FOUND', 404);
    }
}
exports.NotFoundError = NotFoundError;
class ValidationError extends AppError {
    errors;
    constructor(message, errors) {
        super(message, 'VALIDATION_ERROR', 422);
        this.errors = errors;
    }
}
exports.ValidationError = ValidationError;
class UnauthorizedError extends AppError {
    constructor(message = 'Não autorizado') {
        super(message, 'UNAUTHORIZED', 401);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    constructor(message = 'Acesso negado') {
        super(message, 'FORBIDDEN', 403);
    }
}
exports.ForbiddenError = ForbiddenError;
class LicenseError extends AppError {
    constructor(message) {
        super(message, 'LICENSE_ERROR', 403);
    }
}
exports.LicenseError = LicenseError;
class RateLimitError extends AppError {
    constructor(message = 'Limite de requisições atingido') {
        super(message, 'RATE_LIMIT', 429);
    }
}
exports.RateLimitError = RateLimitError;
class ConflictError extends AppError {
    constructor(message) {
        super(message, 'CONFLICT', 409);
    }
}
exports.ConflictError = ConflictError;
class PaymentRequiredError extends AppError {
    constructor(message) {
        super(message, 'PAYMENT_REQUIRED', 402);
    }
}
exports.PaymentRequiredError = PaymentRequiredError;
//# sourceMappingURL=errors.js.map