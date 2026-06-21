"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = requirePermission;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
const actionFieldMap = {
    read: 'canRead',
    write: 'canWrite',
    delete: 'canDelete',
};
function requirePermission(module, action = 'read') {
    return async (req, _res, next) => {
        if (!req.user) {
            return next(new errors_js_1.ForbiddenError('Não autenticado'));
        }
        // OWNER e ADMIN sempre tem acesso total (bypass para evitar lentidão)
        if (req.user.role === 'OWNER' || req.user.role === 'ADMIN') {
            return next();
        }
        try {
            const permission = await prisma_js_1.default.permission.findUnique({
                where: {
                    tenantId_role_module: {
                        tenantId: req.user.tenantId,
                        role: req.user.role,
                        module,
                    },
                },
            });
            if (!permission) {
                return next(new errors_js_1.ForbiddenError(`Sem permissão para acessar ${module}`));
            }
            const field = actionFieldMap[action];
            if (!permission[field]) {
                return next(new errors_js_1.ForbiddenError(`Sem permissão de ${action} em ${module}`));
            }
            next();
        }
        catch {
            return next(new errors_js_1.ForbiddenError('Erro ao verificar permissão'));
        }
    };
}
//# sourceMappingURL=permission.js.map