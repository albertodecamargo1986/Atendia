"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authService = __importStar(require("../services/auth.service.js"));
const passwordResetService = __importStar(require("../services/password-reset.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const errors_js_1 = require("../lib/errors.js");
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const index_js_1 = require("../config/index.js");
const router = (0, express_1.Router)();
// ── SEGURANÇA MELHORADA: httpOnly cookies ──
function setTokenCookies(res, accessToken, refreshToken) {
    const config = (0, index_js_1.getConfig)();
    const isProduction = config.NODE_ENV === 'production';
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 15 * 60 * 1000, // 15 min
        path: '/',
    });
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge,
        path: '/auth',
    });
}
function clearTokenCookies(res) {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/auth' });
}
router.post('/register', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const result = await authService.register(req.body);
    setTokenCookies(res, result.accessToken, result.refreshToken);
    res.status(201).json(result);
}));
router.post('/login', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const result = await authService.login(req.body);
    setTokenCookies(res, result.accessToken, result.refreshToken);
    res.json(result);
}));
router.post('/refresh', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    // Aceita token do cookie OU do body
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken)
        throw new errors_js_1.ValidationError('Refresh token obrigatório');
    const result = await authService.refresh(refreshToken);
    setTokenCookies(res, result.accessToken, result.refreshToken);
    res.json(result);
}));
router.post('/logout', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (refreshToken) {
        await authService.logout(refreshToken);
    }
    clearTokenCookies(res);
    res.json({ message: 'Logout realizado com sucesso' });
}));
router.get('/me', auth_js_1.authMiddleware, (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const [user, tenant] = await Promise.all([
        prisma_js_1.default.user.findUnique({
            where: { id: req.user.sub },
            select: { id: true, name: true, email: true, role: true },
        }),
        prisma_js_1.default.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { id: true, name: true, slug: true, plan: true },
        }),
    ]);
    res.json({
        user: {
            ...req.user,
            name: user?.name || req.user.email,
            tenantName: tenant?.name || '',
            tenantSlug: tenant?.slug || '',
        },
    });
}));
// ── Password Recovery ──
router.post('/forgot-password', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { email } = req.body;
    if (!email)
        throw new errors_js_1.ValidationError('E-mail é obrigatório');
    const result = await passwordResetService.requestPasswordReset(email);
    res.json(result);
}));
router.post('/reset-password', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password)
        throw new errors_js_1.ValidationError('Token e nova senha são obrigatórios');
    const result = await passwordResetService.resetPassword(token, password);
    res.json(result);
}));
router.post('/validate-reset-token', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { token } = req.body;
    const result = await passwordResetService.validateResetToken(token);
    res.json(result);
}));
exports.default = router;
//# sourceMappingURL=auth.js.map