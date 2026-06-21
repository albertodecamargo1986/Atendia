"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireModule = requireModule;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
const plans_js_1 = require("../config/plans.js");
/**
 * Middleware que verifica se o plano do tenant tem acesso ao módulo.
 * Bloqueia requisições se o módulo não estiver no plano contratado.
 */
function requireModule(module) {
    return async (req, _res, next) => {
        try {
            // Admins e Owner têm acesso a todos os módulos (não bloquear admin)
            if (req.user?.role === 'OWNER' || req.user?.role === 'ADMIN') {
                return next();
            }
            const tenantId = req.user.tenantId;
            const tenant = await prisma_js_1.default.tenant.findUnique({
                where: { id: tenantId },
                select: { plan: true },
            });
            if (!tenant) {
                throw new errors_js_1.ForbiddenError('Tenant não encontrado');
            }
            if (!(0, plans_js_1.hasModuleAccess)(tenant.plan, module)) {
                const messages = {
                    campaigns: 'Campanhas são apenas para planos PRO ou superior.',
                    voiceProfiles: 'Perfis de voz são apenas para planos PRO ou superior.',
                    webhooks: 'Webhooks são apenas para planos PRO ou superior.',
                    reports: 'Relatórios avançados são apenas para planos PRO ou superior.',
                    internalChat: 'Chat interno é apenas para planos PRO ou superior.',
                    knowledge: 'Base de conhecimento é apenas para planos PRO ou superior.',
                    queues: 'Filas são apenas para planos Starter ou superior.',
                    tags: 'Tags são apenas para planos Starter ou superior.',
                    quickReplies: 'Respostas rápidas são apenas para planos Starter ou superior.',
                    businessHours: 'Horários de funcionamento são apenas para planos Starter ou superior.',
                    team: 'Gestão de equipe é apenas para planos Starter ou superior.',
                    settings: 'Configurações avançadas são apenas para planos Starter ou superior.',
                };
                throw new errors_js_1.ForbiddenError(messages[module] || `Módulo "${module}" não disponível no seu plano. Faça upgrade para acessar.`);
            }
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
//# sourceMappingURL=feature-gate.js.map