"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceLimit = enforceLimit;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
const LIMIT_MAP = {
    agents: { field: 'maxAgents' },
    whatsappSessions: { field: 'maxWhatsapp' },
    conversations: { field: 'maxConversations' },
};
/**
 * Middleware que verifica se o tenant ainda pode criar o recurso.
 * Compara o limite do plano com a contagem atual no banco.
 */
function enforceLimit(resource) {
    return async (req, _res, next) => {
        try {
            const tenantId = req.user.tenantId;
            const config = LIMIT_MAP[resource];
            const tenant = await prisma_js_1.default.tenant.findUnique({
                where: { id: tenantId },
                select: { [config.field]: true },
            });
            if (!tenant) {
                throw new errors_js_1.ForbiddenError('Tenant não encontrado');
            }
            const limit = Number(tenant[config.field]) || 0;
            // -1 = ilimitado
            if (limit === -1)
                return next();
            const currentCount = await prisma_js_1.default[resource].count({
                where: { tenantId },
            });
            if (currentCount >= limit) {
                const limitLabel = {
                    agents: 'agentes',
                    whatsappSessions: 'sessões WhatsApp',
                    conversations: 'conversações',
                };
                throw new errors_js_1.ForbiddenError(`Limite de ${limitLabel[resource]} atingido (${limit}). Faça upgrade do seu plano para continuar.`);
            }
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
//# sourceMappingURL=plan-enforcer.js.map