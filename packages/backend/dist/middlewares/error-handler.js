"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalErrorHandler = globalErrorHandler;
const errors_js_1 = require("../lib/errors.js");
const zod_1 = require("zod");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ level: process.env.LOG_LEVEL || 'info' });
function globalErrorHandler(err, req, res, _next) {
    const requestId = req.id || 'unknown';
    // Handle Zod validation errors — convert to our ValidationError
    if (err instanceof zod_1.ZodError) {
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
    if (err instanceof errors_js_1.AppError && err.isOperational) {
        const body = {
            success: false,
            error: {
                code: err.code,
                message: err.message,
            },
            requestId,
        };
        if (err instanceof errors_js_1.ValidationError && err.errors) {
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
//# sourceMappingURL=error-handler.js.map