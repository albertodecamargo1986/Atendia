"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.requireRole = requireRole;
const jwt_js_1 = require("../lib/jwt.js");
const errors_js_1 = require("../lib/errors.js");
function authMiddleware(req, _res, next) {
    // Tenta de 3 fontes: header Authorization, cookie httpOnly, query param (fallback WebSocket)
    const headerToken = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null;
    const cookieToken = req.cookies?.accessToken;
    const queryToken = typeof req.query?.token === 'string' ? req.query.token : null;
    const token = headerToken || cookieToken || queryToken;
    if (!token) {
        throw new errors_js_1.UnauthorizedError('Token não fornecido');
    }
    try {
        req.user = (0, jwt_js_1.verifyAccessToken)(token);
        next();
    }
    catch {
        throw new errors_js_1.UnauthorizedError('Token inválido ou expirado');
    }
}
function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user) {
            throw new errors_js_1.UnauthorizedError('Não autenticado');
        }
        if (!roles.includes(req.user.role)) {
            throw new errors_js_1.ForbiddenError('Permissão insuficiente');
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map