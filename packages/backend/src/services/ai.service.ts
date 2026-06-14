import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors.js';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '../lib/prisma.js';
import { getAgentContext } from './knowledge.service.js';
import { getDecryptedKey } from './api-keys.service.js';

const MAX_CONTEXT_MESSAGES = 20;
const AI_TIMEOUT_MS = 30000;

const MODEL_MAP: Record<string, string> = {
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4o': 'gpt-4o',
  'gpt-4.1-mini': 'gpt-4.1-mini',
  'gpt-4.1': 'gpt-4.1',
  'claude-3-haiku': 'claude-haiku-4-5-20251001',
  'claude-3-sonnet': 'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-20250514',
};

function buildMessages(systemPrompt: string, messages: { role: string; content: string }[]): ChatCompletionMessageParam[] {
  const context: ChatCompletionMessageParam[] = messages.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
    content: m.content,
  }));

  return [{ role: 'system' as const, content: systemPrompt }, ...context];
}

async function getOpenAIClient(tenantId: string): Promise<OpenAI> {
  const tenantKey = await getDecryptedKey(tenantId, 'OPENAI');
  const apiKey = tenantKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ValidationError('Nenhuma API Key OpenAI configurada. Adicione uma em Configurações > API Keys.');
  return new OpenAI({ apiKey, timeout: AI_TIMEOUT_MS });
}

async function getAnthropicClient(tenantId: string): Promise<Anthropic> {
  const tenantKey = await getDecryptedKey(tenantId, 'ANTHROPIC');
  const apiKey = tenantKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ValidationError('Nenhuma API Key Anthropic configurada. Adicione uma em Configurações > API Keys.');
  return new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS });
}

export async function generateResponse(
  agentId: string,
  tenantId: string,
  conversationMessages: { role: string; content: string }[]
): Promise<string> {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, tenantId },
  });

  if (!agent) throw new NotFoundError('Agente', agentId);
  if (!agent.isActive) throw new ForbiddenError('Agente inativo');

  let systemPrompt = buildFullPrompt(agent);

  const knowledgeContext = await getAgentContext(agentId, tenantId);
  if (knowledgeContext) {
    const maxKnowledgeChars = 6000;
    const truncated = knowledgeContext.length > maxKnowledgeChars
      ? knowledgeContext.substring(0, maxKnowledgeChars) + '\n[... conteúdo truncado ...]'
      : knowledgeContext;
    systemPrompt += `\n\n--- Base de Conhecimento ---\n${truncated}\n--- Fim da Base de Conhecimento ---\nUse estas informações para responder com precisão quando relevante.`;
  }

  let response: string;

  if (agent.model.startsWith('gpt')) {
    response = await callOpenAI(tenantId, agent.model, systemPrompt, conversationMessages);
  } else if (agent.model.startsWith('claude')) {
    response = await callAnthropic(tenantId, agent.model, systemPrompt, conversationMessages);
  } else {
    throw new ValidationError(`Modelo não suportado: ${agent.model}`);
  }

  await prisma.aiUsageMonthly.upsert({
    where: { tenantId_year_month: { tenantId, year: new Date().getFullYear(), month: new Date().getMonth() + 1 } },
    create: { tenantId, year: new Date().getFullYear(), month: new Date().getMonth() + 1, requestCount: 1 },
    update: { requestCount: { increment: 1 } },
  });

  return response;
}

function buildFullPrompt(agent: {
  systemPrompt: string;
  toneOfVoice: string;
  language: string;
  customPrompt: string | null;
}): string {
  let prompt = agent.systemPrompt;
  prompt += `\n\nTom de voz: ${agent.toneOfVoice}`;
  prompt += `\nIdioma: ${agent.language}`;
  if (agent.customPrompt) {
    prompt += `\nInstruções adicionais: ${agent.customPrompt}`;
  }
  return prompt;
}

async function callOpenAI(
  tenantId: string,
  model: string,
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<string> {
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

async function callAnthropic(
  tenantId: string,
  model: string,
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const anthropic = await getAnthropicClient(tenantId);
  const actualModel = MODEL_MAP[model] || model;
  const apiMessages = messages
    .filter((m) => m.role !== 'system')
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
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

export async function testAgent(
  agentId: string,
  tenantId: string,
  testMessage: string
): Promise<string> {
  return generateResponse(agentId, tenantId, [{ role: 'user', content: testMessage }]);
}

export { MODEL_MAP };
