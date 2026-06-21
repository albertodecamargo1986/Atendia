"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LANGUAGES = exports.TONES = exports.MODELS = void 0;
exports.listAgents = listAgents;
exports.getAgent = getAgent;
exports.createAgent = createAgent;
exports.updateAgent = updateAgent;
exports.deleteAgent = deleteAgent;
exports.activateAgent = activateAgent;
exports.deactivateAgent = deactivateAgent;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const zod_1 = require("zod");
const errors_js_1 = require("../lib/errors.js");
const createAgentSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    description: zod_1.z.string().optional(),
    model: zod_1.z.enum(['gpt-4o-mini', 'gpt-4o', 'claude-3-haiku', 'claude-3-sonnet', 'gpt-4.1-mini', 'gpt-4.1', 'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'], {
        errorMap: () => ({ message: 'Modelo inválido' }),
    }),
    systemPrompt: zod_1.z.string().min(10, 'Prompt deve ter no mínimo 10 caracteres'),
    temperature: zod_1.z.number().min(0).max(2).default(0.7),
    toneOfVoice: zod_1.z.string().default('amigavel'),
    language: zod_1.z.string().default('pt-BR'),
    customPrompt: zod_1.z.string().optional(),
    responseDelayMinMs: zod_1.z.number().int().min(0).max(30000).default(1000),
    responseDelayMaxMs: zod_1.z.number().int().min(0).max(30000).default(4000),
    sendAudioFrequency: zod_1.z.number().int().min(0).max(20).default(3),
    voiceProfileId: zod_1.z.string().optional(),
});
const updateAgentSchema = createAgentSchema.partial();
const MODELS = ['gpt-4o-mini', 'gpt-4o', 'claude-3-haiku', 'claude-3-sonnet', 'gpt-4.1-mini', 'gpt-4.1', 'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'];
exports.MODELS = MODELS;
const TONES = ['amigavel', 'formal', 'casual', 'tecnico', 'vendas'];
exports.TONES = TONES;
const LANGUAGES = ['pt-BR', 'en-US', 'es-ES'];
exports.LANGUAGES = LANGUAGES;
async function listAgents(tenantId) {
    return prisma_js_1.default.agent.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: {
            _count: { select: { conversations: true, knowledgeBases: true } },
        },
    });
}
async function getAgent(tenantId, agentId) {
    const agent = await prisma_js_1.default.agent.findFirst({
        where: { id: agentId, tenantId },
        include: {
            knowledgeBases: true,
            escalationRules: true,
        },
    });
    if (!agent)
        throw new errors_js_1.NotFoundError('Agente', agentId);
    return agent;
}
async function createAgent(tenantId, data) {
    const parsed = createAgentSchema.parse(data);
    const tenant = await prisma_js_1.default.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant)
        throw new errors_js_1.NotFoundError('Empresa', tenantId);
    const agentCount = await prisma_js_1.default.agent.count({ where: { tenantId } });
    if (agentCount >= tenant.maxAgents) {
        throw new errors_js_1.ForbiddenError(`Limite de agentes atingido (${tenant.maxAgents}). Faça upgrade do plano.`);
    }
    return prisma_js_1.default.agent.create({
        data: {
            tenantId,
            name: parsed.name,
            description: parsed.description,
            model: parsed.model,
            systemPrompt: parsed.systemPrompt,
            temperature: parsed.temperature,
            toneOfVoice: parsed.toneOfVoice,
            language: parsed.language,
            customPrompt: parsed.customPrompt,
            isDraft: true,
        },
    });
}
async function updateAgent(tenantId, agentId, data) {
    const parsed = updateAgentSchema.parse(data);
    const existing = await prisma_js_1.default.agent.findFirst({
        where: { id: agentId, tenantId },
    });
    if (!existing)
        throw new errors_js_1.NotFoundError('Agente', agentId);
    return prisma_js_1.default.agent.update({
        where: { id: agentId },
        data: parsed,
    });
}
async function deleteAgent(tenantId, agentId) {
    const existing = await prisma_js_1.default.agent.findFirst({
        where: { id: agentId, tenantId },
    });
    if (!existing)
        throw new errors_js_1.NotFoundError('Agente', agentId);
    const activeConversations = await prisma_js_1.default.conversation.count({
        where: { agentId, status: 'ACTIVE' },
    });
    if (activeConversations > 0) {
        throw new errors_js_1.ForbiddenError('Não é possível deletar um agente com conversas ativas');
    }
    return prisma_js_1.default.agent.delete({ where: { id: agentId } });
}
async function activateAgent(tenantId, agentId) {
    const existing = await prisma_js_1.default.agent.findFirst({
        where: { id: agentId, tenantId },
    });
    if (!existing)
        throw new errors_js_1.NotFoundError('Agente', agentId);
    if (!existing.systemPrompt) {
        throw new errors_js_1.ValidationError('Agente precisa de um prompt do sistema para ser ativado');
    }
    return prisma_js_1.default.agent.update({
        where: { id: agentId },
        data: { isActive: true, isDraft: false },
    });
}
async function deactivateAgent(tenantId, agentId) {
    const existing = await prisma_js_1.default.agent.findFirst({
        where: { id: agentId, tenantId },
    });
    if (!existing)
        throw new errors_js_1.NotFoundError('Agente', agentId);
    return prisma_js_1.default.agent.update({
        where: { id: agentId },
        data: { isActive: false },
    });
}
//# sourceMappingURL=agent.service.js.map