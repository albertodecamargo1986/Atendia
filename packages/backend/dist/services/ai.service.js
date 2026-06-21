"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_MAP = void 0;
exports.generateResponse = generateResponse;
exports.testAgent = testAgent;
const errors_js_1 = require("../lib/errors.js");
const openai_1 = __importDefault(require("openai"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const knowledge_service_js_1 = require("./knowledge.service.js");
const api_keys_service_js_1 = require("./api-keys.service.js");
const MAX_CONTEXT_MESSAGES = 20;
const AI_TIMEOUT_MS = 30000;
const MODEL_MAP = {
    'gpt-4o-mini': 'gpt-4o-mini',
    'gpt-4o': 'gpt-4o',
    'gpt-4.1-mini': 'gpt-4.1-mini',
    'gpt-4.1': 'gpt-4.1',
    'claude-3-haiku': 'claude-haiku-4-5-20251001',
    'claude-3-sonnet': 'claude-sonnet-4-20250514',
    'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
    'claude-sonnet-4-20250514': 'claude-sonnet-4-20250514',
};
exports.MODEL_MAP = MODEL_MAP;
function buildMessages(systemPrompt, messages) {
    const context = messages.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
    }));
    return [{ role: 'system', content: systemPrompt }, ...context];
}
async function getOpenAIClient(tenantId) {
    const tenantKey = await (0, api_keys_service_js_1.getDecryptedKey)(tenantId, 'OPENAI');
    const apiKey = tenantKey || process.env.OPENAI_API_KEY;
    if (!apiKey)
        throw new errors_js_1.ValidationError('Nenhuma API Key OpenAI configurada. Adicione uma em Configurações > API Keys.');
    return new openai_1.default({ apiKey, timeout: AI_TIMEOUT_MS });
}
async function getAnthropicClient(tenantId) {
    const tenantKey = await (0, api_keys_service_js_1.getDecryptedKey)(tenantId, 'ANTHROPIC');
    const apiKey = tenantKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
        throw new errors_js_1.ValidationError('Nenhuma API Key Anthropic configurada. Adicione uma em Configurações > API Keys.');
    return new sdk_1.default({ apiKey, timeout: AI_TIMEOUT_MS });
}
async function generateResponse(agentId, tenantId, conversationMessages) {
    const agent = await prisma_js_1.default.agent.findFirst({
        where: { id: agentId, tenantId },
    });
    if (!agent)
        throw new errors_js_1.NotFoundError('Agente', agentId);
    if (!agent.isActive)
        throw new errors_js_1.ForbiddenError('Agente inativo');
    let systemPrompt = buildFullPrompt(agent);
    const knowledgeContext = await (0, knowledge_service_js_1.getAgentContext)(agentId, tenantId);
    if (knowledgeContext) {
        const maxKnowledgeChars = 6000;
        const truncated = knowledgeContext.length > maxKnowledgeChars
            ? knowledgeContext.substring(0, maxKnowledgeChars) + '\n[... conteúdo truncado ...]'
            : knowledgeContext;
        systemPrompt += `\n\n--- Base de Conhecimento ---\n${truncated}\n--- Fim da Base de Conhecimento ---\nUse estas informações para responder com precisão quando relevante.`;
    }
    let response;
    if (agent.model.startsWith('gpt')) {
        response = await callOpenAI(tenantId, agent.model, systemPrompt, conversationMessages);
    }
    else if (agent.model.startsWith('claude')) {
        response = await callAnthropic(tenantId, agent.model, systemPrompt, conversationMessages);
    }
    else {
        throw new errors_js_1.ValidationError(`Modelo não suportado: ${agent.model}`);
    }
    await prisma_js_1.default.aiUsageMonthly.upsert({
        where: { tenantId_year_month: { tenantId, year: new Date().getFullYear(), month: new Date().getMonth() + 1 } },
        create: { tenantId, year: new Date().getFullYear(), month: new Date().getMonth() + 1, requestCount: 1 },
        update: { requestCount: { increment: 1 } },
    });
    return response;
}
function buildFullPrompt(agent) {
    let prompt = agent.systemPrompt;
    prompt += `\n\nTom de voz: ${agent.toneOfVoice}`;
    prompt += `\nIdioma: ${agent.language}`;
    if (agent.customPrompt) {
        prompt += `\nInstruções adicionais: ${agent.customPrompt}`;
    }
    return prompt;
}
async function callOpenAI(tenantId, model, systemPrompt, messages) {
    const openai = await getOpenAIClient(tenantId);
    const actualModel = MODEL_MAP[model] || model;
    const completion = await openai.chat.completions.create({
        model: actualModel,
        messages: buildMessages(systemPrompt, messages),
        temperature: 0.7,
        max_tokens: 1000,
    });
    return completion.choices[0]?.message?.content || 'Desculpe, não consegui gerar uma resposta.';
}
async function callAnthropic(tenantId, model, systemPrompt, messages) {
    const anthropic = await getAnthropicClient(tenantId);
    const actualModel = MODEL_MAP[model] || model;
    const apiMessages = messages
        .filter((m) => m.role !== 'system')
        .slice(-MAX_CONTEXT_MESSAGES)
        .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
    }));
    const response = await anthropic.messages.create({
        model: actualModel,
        max_tokens: 1000,
        system: systemPrompt,
        messages: apiMessages,
    });
    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock && textBlock.type === 'text' ? textBlock.text : 'Desculpe, não consegui gerar uma resposta.';
}
async function testAgent(agentId, tenantId, testMessage) {
    return generateResponse(agentId, tenantId, [{ role: 'user', content: testMessage }]);
}
//# sourceMappingURL=ai.service.js.map