"use strict";
/**
 * Configuração de planos do AtendIA.
 * Define quais módulos e recursos cada plano tem acesso.
 *
 * PLAN_FEATURES: módulos liberados por plano
 * PLAN_LIMITS: limites de recursos por plano (valores padrão, sobrescritos pelo tenant)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLANS = exports.MODULES = void 0;
exports.hasModuleAccess = hasModuleAccess;
exports.getPlanLimits = getPlanLimits;
exports.MODULES = [
    'dashboard', 'tickets', 'conversations', 'contacts', 'agents', 'queues', 'tags',
    'quickReplies', 'campaigns', 'voiceProfiles', 'webhooks', 'reports', 'internalChat',
    'knowledge', 'whatsapp', 'businessHours', 'team', 'license', 'settings', 'admin',
];
exports.PLANS = {
    FREE: {
        name: 'Free',
        price: 0,
        features: ['dashboard', 'tickets', 'conversations', 'contacts', 'agents', 'whatsapp', 'license'],
        limits: {
            maxAgents: 1,
            maxWhatsapp: 1,
            maxConversations: 100,
            maxAiRequests: 500,
            maxTeamMembers: 1,
        },
    },
    STARTER: {
        name: 'Starter',
        price: 147,
        features: [
            'dashboard', 'tickets', 'conversations', 'contacts', 'agents', 'queues',
            'tags', 'quickReplies', 'whatsapp', 'businessHours', 'team', 'license', 'settings',
        ],
        limits: {
            maxAgents: 3,
            maxWhatsapp: 2,
            maxConversations: 1000,
            maxAiRequests: 5000,
            maxTeamMembers: 5,
        },
    },
    PRO: {
        name: 'Pro',
        price: 381,
        features: [
            'dashboard', 'tickets', 'conversations', 'contacts', 'agents', 'queues',
            'tags', 'quickReplies', 'campaigns', 'voiceProfiles', 'webhooks', 'reports',
            'internalChat', 'knowledge', 'whatsapp', 'businessHours', 'team', 'license',
            'settings',
        ],
        limits: {
            maxAgents: 10,
            maxWhatsapp: 5,
            maxConversations: 10000,
            maxAiRequests: 50000,
            maxTeamMembers: 20,
        },
    },
    ENTERPRISE: {
        name: 'Enterprise',
        price: 1044,
        features: ['*'], // tudo liberado
        limits: {
            maxAgents: -1, // ilimitado
            maxWhatsapp: -1,
            maxConversations: -1,
            maxAiRequests: -1,
            maxTeamMembers: -1,
        },
    },
};
function hasModuleAccess(plan, module) {
    const config = exports.PLANS[plan];
    if (!config)
        return false;
    if (config.features.includes('*'))
        return true;
    return config.features.includes(module);
}
function getPlanLimits(plan) {
    const config = exports.PLANS[plan];
    if (!config)
        return exports.PLANS.FREE.limits;
    return config.limits;
}
//# sourceMappingURL=plans.js.map