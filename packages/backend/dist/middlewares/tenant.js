"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantMiddleware = tenantMiddleware;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
async function tenantMiddleware(req, res, next) {
    if (!req.user?.tenantId) {
        throw new errors_js_1.UnauthorizedError('Tenant não informado');
    }
    const tenant = await prisma_js_1.default.tenant.findUnique({
        where: { id: req.user.tenantId },
    });
    if (!tenant || !tenant.isActive) {
        throw new errors_js_1.ForbiddenError('Empresa não encontrada ou inativa');
    }
    // Set tenant context on request for downstream middlewares
    req.tenantId = tenant.id;
    req.tenant = {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        isActive: tenant.isActive,
    };
    next();
}
//# sourceMappingURL=tenant.js.map