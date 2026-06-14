import prisma from '../lib/prisma.js';
import { z } from 'zod';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../lib/errors.js';

const createAgentSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  description: z.string().optional(),
  model: z.enum(['gpt-4o-mini', 'gpt-4o', 'claude-3-haiku', 'claude-3-sonnet', 'gpt-4.1-mini', 'gpt-4.1', 'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'], {
    errorMap: () => ({ message: 'Modelo inválido' }),
  }),
  systemPrompt: z.string().min(10, 'Prompt deve ter no mínimo 10 caracteres'),
  temperature: z.number().min(0).max(2).default(0.7),
  toneOfVoice: z.string().default('amigavel'),
  language: z.string().default('pt-BR'),
  customPrompt: z.string().optional(),
  responseDelayMinMs: z.number().int().min(0).max(30000).default(1000),
  responseDelayMaxMs: z.number().int().min(0).max(30000).default(4000),
  sendAudioFrequency: z.number().int().min(0).max(20).default(3),
  voiceProfileId: z.string().optional(),
});

const updateAgentSchema = createAgentSchema.partial();

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

const MODELS = ['gpt-4o-mini', 'gpt-4o', 'claude-3-haiku', 'claude-3-sonnet', 'gpt-4.1-mini', 'gpt-4.1', 'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'] as const;
const TONES = ['amigavel', 'formal', 'casual', 'tecnico', 'vendas'] as const;
const LANGUAGES = ['pt-BR', 'en-US', 'es-ES'] as const;

export async function listAgents(tenantId: string) {
  return prisma.agent.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { conversations: true, knowledgeBases: true } },
    },
  });
}

export async function getAgent(tenantId: string, agentId: string) {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, tenantId },
    include: {
      knowledgeBases: true,
      escalationRules: true,
    },
  });
  if (!agent) throw new NotFoundError('Agente', agentId);
  return agent;
}

export async function createAgent(tenantId: string, data: CreateAgentInput) {
  const parsed = createAgentSchema.parse(data);

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Empresa', tenantId);

  const agentCount = await prisma.agent.count({ where: { tenantId } });
  if (agentCount >= tenant.maxAgents) {
    throw new ForbiddenError(`Limite de agentes atingido (${tenant.maxAgents}). Faça upgrade do plano.`);
  }

  return prisma.agent.create({
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

export async function updateAgent(tenantId: string, agentId: string, data: UpdateAgentInput) {
  const parsed = updateAgentSchema.parse(data);

  const existing = await prisma.agent.findFirst({
    where: { id: agentId, tenantId },
  });
  if (!existing) throw new NotFoundError('Agente', agentId);

  return prisma.agent.update({
    where: { id: agentId },
    data: parsed,
  });
}

export async function deleteAgent(tenantId: string, agentId: string) {
  const existing = await prisma.agent.findFirst({
    where: { id: agentId, tenantId },
  });
  if (!existing) throw new NotFoundError('Agente', agentId);

  const activeConversations = await prisma.conversation.count({
    where: { agentId, status: 'ACTIVE' },
  });
  if (activeConversations > 0) {
    throw new ForbiddenError('Não é possível deletar um agente com conversas ativas');
  }

  return prisma.agent.delete({ where: { id: agentId } });
}

export async function activateAgent(tenantId: string, agentId: string) {
  const existing = await prisma.agent.findFirst({
    where: { id: agentId, tenantId },
  });
  if (!existing) throw new NotFoundError('Agente', agentId);

  if (!existing.systemPrompt) {
    throw new ValidationError('Agente precisa de um prompt do sistema para ser ativado');
  }

  return prisma.agent.update({
    where: { id: agentId },
    data: { isActive: true, isDraft: false },
  });
}

export async function deactivateAgent(tenantId: string, agentId: string) {
  const existing = await prisma.agent.findFirst({
    where: { id: agentId, tenantId },
  });
  if (!existing) throw new NotFoundError('Agente', agentId);

  return prisma.agent.update({
    where: { id: agentId },
    data: { isActive: false },
  });
}

export { MODELS, TONES, LANGUAGES };
