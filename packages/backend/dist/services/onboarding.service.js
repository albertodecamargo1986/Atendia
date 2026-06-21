"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOnboardingProgress = getOnboardingProgress;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
async function getOnboardingProgress(tenantId) {
    const [agents, whatsappSessions, businessHours, users] = await Promise.all([
        prisma_js_1.default.agent.count({ where: { tenantId } }),
        prisma_js_1.default.whatsAppSession.count({ where: { tenantId } }),
        prisma_js_1.default.businessHour.count({ where: { tenantId } }),
        prisma_js_1.default.user.count({ where: { tenantId, isActive: true } }),
    ]);
    const steps = [
        {
            id: 'create_agent',
            title: 'Criar seu primeiro agente de IA',
            description: 'Configure um agente com personalidade e regras para atender clientes automaticamente.',
            completed: agents > 0,
            skippable: false,
            route: '/agents/new',
        },
        {
            id: 'connect_whatsapp',
            title: 'Conectar WhatsApp',
            description: 'Conecte um número de WhatsApp para começar a receber mensagens.',
            completed: whatsappSessions > 0,
            skippable: false,
            route: '/whatsapp',
        },
        {
            id: 'set_business_hours',
            title: 'Configurar horários de funcionamento',
            description: 'Defina os horários que sua empresa atende para que o sistema saiba quando responder.',
            completed: businessHours > 0,
            skippable: true,
            route: '/business-hours',
        },
        {
            id: 'invite_team',
            title: 'Convidar equipe',
            description: 'Adicione atendentes humanos para gerenciar conversas que precisam de intervenção.',
            completed: users > 1,
            skippable: true,
            route: '/team',
        },
    ];
    const completedCount = steps.filter((s) => s.completed).length;
    const mandatoryCompleted = steps
        .filter((s) => !s.skippable)
        .every((s) => s.completed);
    // Considera completo se todos os steps obrigatórios foram feitos
    const isComplete = mandatoryCompleted;
    return {
        steps,
        progress: Math.round((completedCount / steps.length) * 100),
        isComplete,
    };
}
//# sourceMappingURL=onboarding.service.js.map