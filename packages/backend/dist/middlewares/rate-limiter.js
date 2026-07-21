"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkoutLimiter = exports.webhookLimiter = exports.authLimiter = exports.publicLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rlBase = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
};
// General public limiter
exports.publicLimiter = (0, express_rate_limit_1.default)({
    ...rlBase,
    max: 100,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT',
            message: 'Limite de requisições atingido. Tente novamente em alguns minutos.'
        }
    }
});
// Auth limiter - stricter
exports.authLimiter = (0, express_rate_limit_1.default)({
    ...rlBase,
    max: 20,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT',
            message: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
        }
    }
});
// Webhook limiter - higher limit for payment provider callbacks
exports.webhookLimiter = (0, express_rate_limit_1.default)({
    ...rlBase,
    max: 1000,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT',
            message: 'Limite de webhook excedido.'
        }
    }
});
// Checkout limiter - for payment creation
exports.checkoutLimiter = (0, express_rate_limit_1.default)({
    ...rlBase,
    max: 30,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT',
            message: 'Muitas tentativas de checkout. Tente novamente em alguns minutos.'
        }
    }
});
//# sourceMappingURL=rate-limiter.js.map