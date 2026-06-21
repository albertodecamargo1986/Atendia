/**
 * Configuração de planos do AtendIA.
 * Define quais módulos e recursos cada plano tem acesso.
 *
 * PLAN_FEATURES: módulos liberados por plano
 * PLAN_LIMITS: limites de recursos por plano (valores padrão, sobrescritos pelo tenant)
 */
export type PlanId = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
export interface PlanConfig {
    name: string;
    price: number;
    features: string[];
    limits: {
        maxAgents: number;
        maxWhatsapp: number;
        maxConversations: number;
        maxAiRequests: number;
        maxTeamMembers: number;
    };
}
export declare const MODULES: readonly ["dashboard", "tickets", "conversations", "contacts", "agents", "queues", "tags", "quickReplies", "campaigns", "voiceProfiles", "webhooks", "reports", "internalChat", "knowledge", "whatsapp", "businessHours", "team", "license", "settings", "admin"];
export type ModuleId = (typeof MODULES)[number];
export declare const PLANS: Record<PlanId, PlanConfig>;
export declare function hasModuleAccess(plan: PlanId, module: string): boolean;
export declare function getPlanLimits(plan: PlanId): PlanConfig['limits'];
