export declare class AppError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly isOperational: boolean;
    constructor(message: string, code: string, statusCode: number, isOperational?: boolean);
}
export declare class NotFoundError extends AppError {
    constructor(resource: string, id: string);
}
export declare class ValidationError extends AppError {
    readonly errors?: string[];
    constructor(message: string, errors?: string[]);
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
export declare class ForbiddenError extends AppError {
    constructor(message?: string);
}
export declare class LicenseError extends AppError {
    constructor(message: string);
}
export declare class RateLimitError extends AppError {
    constructor(message?: string);
}
export declare class ConflictError extends AppError {
    constructor(message: string);
}
export declare class PaymentRequiredError extends AppError {
    constructor(message: string);
}
