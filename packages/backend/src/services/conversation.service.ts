import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { getIO } from '../lib/socket.js';
import { offhoursMessageQueue, whatsappOutboundQueue } from '../workers/queues.js';
import { isWithinBusinessHours } from './business-hours.service.js';
import { z } from 'zod';
import { updateTicket, closeTicket, reopenTicket } from './ticket.service.js';
import { resolveConversationRoute } from './whatsapp.service.js';
import { scheduleAiResponse } from '../lib/ai-schedule.js';
import { claimOnce, resetAiReplyCounters, TWELVE_HOURS_SEC } from '../lib/wa-guards.js';
import { resolveUploadPath } from '../lib/uploads.js';

const sendMessageSchema = z.object({
  content: z.string().min(1, 'Mensagem nao pode estar vazia'),
  role: z.enum(['USER', 'ASSISTANT', 'SYSTEM']).default('USER'),
  mediaUrl: z.string().optional(),
  mediaType: z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT']).optional(),
});

const createConversationSchema = z.object({
  channel: z.enum(['WHATSAPP', 'WEB', 'TELEGRAM', 'INSTAGRAM'], { errorMap: () => ({ message: 'Canal inválido' }) }),
  contactName: z.string().min(1, 'Nome do contato é obrigatório'),
  contactEmail: z.string().email().optional(),
  agentId: z.string().optional(),
});

export async function createConversation(
  tenantId: string,
  data: { channel: string; contactName: string; contactEmail?: string; agentId?: string }
) {
  const parsed = createConversationSchema.parse(data);
  let agentId: string | undefined;
  if (parsed.agentId) {
    // IDOR: o agente informado precisa ser do mesmo tenant
    const agent = await prisma.agent.findFirst({ where: { id: parsed.agentId, tenantId }, select: { id: true } });
    if (!agent) throw new NotFoundError('Agente', parsed.agentId);
    agentId = agent.id;
  } else {
    agentId = (await prisma.agent.findFirst({ where: { tenantId, isActive: true }, orderBy: { createdAt: 'asc' } }))?.id;
  }
  if (!agentId) throw new ValidationError('Nenhum agente ativo encontrado');

  return prisma.conversation.create({
    data: {
      tenantId,
      agentId,
      channel: parsed.channel,
      contactName: parsed.contactName,
      contactEmail: parsed.contactEmail,
      status: 'ACTIVE',
    },
    include: {
      agent: { select: { id: true, name: true, model: true } },
      _count: { select: { messages: true } },
    },
  });
}

export async function listConversations(tenantId: string, filters?: { status?: string; agentId?: string; page?: number }) {
  const where: any = { tenantId };
  if (filters?.status) where.status = filters.status;
  if (filters?.agentId) where.agentId = filters.agentId;

  const page = filters?.page || 1;
  const limit = 50;
  const offset = limit * (page - 1);

  const [conversations, count] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        agent: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.conversation.count({ where }),
  ]);

  return { conversations, count, hasMore: count > offset + conversations.length };
}

export async function getConversation(tenantId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    include: {
      agent: { select: { id: true, name: true, model: true } },
      operator: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!conversation) throw new NotFoundError('Conversa', conversationId);
  return conversation;
}

export async function sendMessage(
  tenantId: string,
  conversationId: string,
  data: z.infer<typeof sendMessageSchema>,
  userId?: string
) {
  const parsed = sendMessageSchema.parse(data);

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    include: { agent: true },
  });

  if (!conversation) throw new NotFoundError('Conversa', conversationId);

  const fromOperator = !!userId && parsed.role !== 'USER';
  if (fromOperator && conversation.status === 'RESOLVED') {
    throw new ValidationError('Conversa encerrada: reabra o atendimento para enviar mensagens.');
  }

  // Arquivo do operador: precisa estar dentro dos uploads do próprio tenant
  let mediaPath: string | null = null;
  if (parsed.mediaUrl) {
    mediaPath = resolveUploadPath(parsed.mediaUrl);
    if (!mediaPath || !parsed.mediaUrl.startsWith(`/uploads/${tenantId}/`)) {
      throw new ValidationError('Arquivo inválido');
    }
  }

  // Para onde enviar (antes de gravar: sem rota, não grava mensagem "fantasma")
  const route = fromOperator && conversation.channel === 'WHATSAPP'
    ? await resolveConversationRoute(tenantId, conversationId)
    : null;
  if (fromOperator && conversation.channel === 'WHATSAPP' && !route) {
    throw new ValidationError('Não foi possível identificar o WhatsApp deste contato');
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      role: parsed.role,
      content: parsed.content,
      mediaUrl: parsed.mediaUrl,
      mediaType: parsed.mediaType,
      ...(fromOperator ? { metadata: { userId, status: 'queued' } } : {}),
    },
  });

  getIO().to(`tenant:${tenantId}`).emit('message:new', { conversationId, message });
  getIO().to(`conversation:${conversationId}`).emit('message:new', { conversationId, message });

  // Update ticket if one exists
  const ticket = await prisma.ticket.findUnique({ where: { conversationId } });
  if (ticket) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { lastMessage: parsed.content.substring(0, 255) },
    });
    getIO().to(`ticket:${ticket.id}`).emit('message:new', { conversationId, message });
  }

  // Mensagem de cliente vinda da API/canal web (não do operador): IA com debounce
  if (parsed.role === 'USER' && conversation.status === 'ACTIVE' && conversation.agent.isActive && !userId) {
    const withinHours = await isWithinBusinessHours(tenantId);

    if (!withinHours) {
      if (await claimOnce(`offhours:${conversationId}`, TWELVE_HOURS_SEC)) {
        await offhoursMessageQueue.add('offhours', {
          tenantId,
          conversationId,
          agentName: conversation.agent.name,
        }, { jobId: `offhours-${conversationId}` });
      }
      return message;
    }

    await scheduleAiResponse({
      tenantId,
      conversationId,
      agentId: conversation.agentId,
      triggerMessageId: message.id,
    });
    return message;
  }

  // Operador respondendo: qualquer status ≠ RESOLVED; a IA sai da conversa (HUMAN_TAKEOVER)
  if (fromOperator && route) {
    if (conversation.status !== 'HUMAN_TAKEOVER') {
      const updated = await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'HUMAN_TAKEOVER', assignedTo: conversation.assignedTo ?? userId },
      });
      getIO().to(`tenant:${tenantId}`).emit('conversation:updated', { conversation: updated });
      if (ticket && ticket.status === 'PENDING') {
        try {
          await updateTicket(tenantId, ticket.id, { status: 'OPEN', assignedTo: ticket.assignedTo ?? userId! });
        } catch { /* atendente sem permissão/inativo: mantém pendente */ }
      }
    }

    await whatsappOutboundQueue.add('send', {
      sessionId: route.sessionId,
      tenantId,
      conversationId,
      jid: route.jid,
      content: parsed.content,
      messageId: message.id,
      ...(mediaPath && parsed.mediaUrl
        ? {
            media: {
              mediaType: parsed.mediaType || 'DOCUMENT',
              url: parsed.mediaUrl,
              // O painel manda o nome do arquivo como conteúdo: vira o nome do documento (sem legenda)
              fileName: parsed.content || undefined,
            },
          }
        : {}),
    }, { jobId: `out-${message.id}` });
  }

  return message;
}

export async function escalateConversation(
  tenantId: string,
  conversationId: string,
  userId: string
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
  });
  if (!conversation) throw new NotFoundError('Conversa', conversationId);

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: 'HUMAN_TAKEOVER',
      assignedTo: userId,
    },
  });

  const systemMessage = await prisma.message.create({
    data: {
      conversationId,
      role: 'SYSTEM',
      content: 'Conversa escalonada para atendimento humano.',
    },
  });

  getIO().to(`tenant:${tenantId}`).emit('conversation:updated', { conversation: updated });
  getIO().to(`conversation:${conversationId}`).emit('message:new', { conversationId, message: systemMessage });

  // Update ticket: assign to user and set OPEN
  const ticket = await prisma.ticket.findUnique({ where: { conversationId } });
  if (ticket) {
    await updateTicket(tenantId, ticket.id, { status: 'OPEN', assignedTo: userId });
  }

  return updated;
}

export async function returnToAgent(tenantId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    include: { agent: true },
  });
  if (!conversation) throw new NotFoundError('Conversa', conversationId);
  // PENDING é legado (antigo "fora do horário"); também pode voltar para a IA
  if (conversation.status !== 'HUMAN_TAKEOVER' && conversation.status !== 'PENDING') {
    throw new ValidationError('Apenas conversas em takeover podem ser devolvidas ao agente');
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'ACTIVE', assignedTo: null },
  });
  // Recomeça a contagem anti-loop (a pausa por "possível robô" foi revista por uma pessoa)
  await resetAiReplyCounters(conversationId).catch(() => {});

  const systemMessage = await prisma.message.create({
    data: {
      conversationId,
      role: 'SYSTEM',
      content: 'Conversa devolvida para o agente de IA.',
    },
  });

  getIO().to(`tenant:${tenantId}`).emit('conversation:updated', { conversation: updated });
  getIO().to(`conversation:${conversationId}`).emit('message:new', { conversationId, message: systemMessage });

  // Update ticket: set back to PENDING (returns to queue)
  const ticket = await prisma.ticket.findUnique({ where: { conversationId } });
  if (ticket) {
    await reopenTicket(tenantId, ticket.id);
  }

  return updated;
}

export async function transferConversation(
  tenantId: string,
  conversationId: string,
  toUserId: string
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
  });
  if (!conversation) throw new NotFoundError('Conversa', conversationId);

  const targetUser = await prisma.user.findFirst({
    where: { id: toUserId, tenantId, isActive: true },
  });
  if (!targetUser) throw new NotFoundError('Operador', toUserId);

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { assignedTo: toUserId, status: 'HUMAN_TAKEOVER' },
  });

  const fromName = conversation.assignedTo ? 'outro operador' : 'agente';
  const systemMessage = await prisma.message.create({
    data: {
      conversationId,
      role: 'SYSTEM',
      content: `Conversa transferida de ${fromName} para ${targetUser.name}.`,
    },
  });

  getIO().to(`tenant:${tenantId}`).emit('conversation:updated', { conversation: updated });
  getIO().to(`conversation:${conversationId}`).emit('message:new', { conversationId, message: systemMessage });

  // Update ticket: transfer to new user
  const ticket = await prisma.ticket.findUnique({ where: { conversationId } });
  if (ticket) {
    await updateTicket(tenantId, ticket.id, { assignedTo: toUserId });
  }

  return updated;
}

export async function addInternalNote(
  tenantId: string,
  conversationId: string,
  content: string,
  userId: string
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
  });
  if (!conversation) throw new NotFoundError('Conversa', conversationId);

  const message = await prisma.message.create({
    data: {
      conversationId,
      role: 'SYSTEM',
      content: `[Nota Interna] ${content}`,
      metadata: { isInternalNote: true, userId },
    },
  });

  getIO().to(`conversation:${conversationId}`).emit('message:new', { conversationId, message });

  const ticket = await prisma.ticket.findUnique({ where: { conversationId } });
  if (ticket) {
    getIO().to(`ticket:${ticket.id}`).emit('message:new', { conversationId, message });
  }

  return message;
}

export async function resolveConversation(tenantId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
  });
  if (!conversation) throw new NotFoundError('Conversa', conversationId);

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'RESOLVED' },
  });

  getIO().to(`tenant:${tenantId}`).emit('conversation:updated', { conversation: updated });

  // Close ticket
  const ticket = await prisma.ticket.findUnique({ where: { conversationId } });
  if (ticket) {
    await closeTicket(tenantId, ticket.id);
  }

  return updated;
}

export async function deleteConversation(tenantId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
  });
  if (!conversation) throw new NotFoundError('Conversa', conversationId);

  // Delete associated ticket first if exists
  const ticket = await prisma.ticket.findUnique({ where: { conversationId } });
  if (ticket) {
    await prisma.ticketTag.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.ticketRating.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.ticket.delete({ where: { id: ticket.id } });
  }

  // Delete all messages then the conversation
  await prisma.message.deleteMany({ where: { conversationId } });
  await prisma.conversation.delete({ where: { id: conversationId } });

  getIO().to(`tenant:${tenantId}`).emit('conversation:deleted', { conversationId });
}

export async function getConversationStats(tenantId: string) {
  const [active, pending, resolved, takeover] = await Promise.all([
    prisma.conversation.count({ where: { tenantId, status: 'ACTIVE' } }),
    prisma.conversation.count({ where: { tenantId, status: 'PENDING' } }),
    prisma.conversation.count({ where: { tenantId, status: 'RESOLVED' } }),
    prisma.conversation.count({ where: { tenantId, status: 'HUMAN_TAKEOVER' } }),
  ]);

  return { active, pending, resolved, takeover, total: active + pending + resolved + takeover };
}

export async function getDailyStats(tenantId: string, days = 14) {
  // Limita o período (evita consultas enormes): 1 a 90 dias
  days = Math.min(Math.max(Math.floor(Number(days) || 14), 1), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [conversations, tickets] = await Promise.all([
    prisma.conversation.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { createdAt: true, status: true },
    }),
    prisma.ticket.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { createdAt: true, status: true },
    }),
  ]);

  const dailyMap = new Map<string, { conversations: number; tickets: number; resolved: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, { conversations: 0, tickets: 0, resolved: 0 });
  }

  for (const c of conversations) {
    const key = c.createdAt.toISOString().slice(0, 10);
    const entry = dailyMap.get(key);
    if (entry) entry.conversations++;
    if (c.status === 'RESOLVED') {
      const dayKey = c.createdAt.toISOString().slice(0, 10);
      const resEntry = dailyMap.get(dayKey);
      if (resEntry) resEntry.resolved++;
    }
  }

  for (const t of tickets) {
    const key = t.createdAt.toISOString().slice(0, 10);
    const entry = dailyMap.get(key);
    if (entry) entry.tickets++;
  }

  return Array.from(dailyMap.entries()).map(([date, data]) => ({ date, ...data }));
}
