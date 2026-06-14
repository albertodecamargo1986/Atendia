import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { getIO } from '../lib/socket.js';
import { aiResponseQueue } from '../workers/queues.js';
import { isWithinBusinessHours } from './business-hours.service.js';
import { offhoursMessageQueue } from '../workers/queues.js';
import { z } from 'zod';
import { updateTicket, closeTicket, reopenTicket } from './ticket.service.js';

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
  const agentId = parsed.agentId || ((await prisma.agent.findFirst({ where: { tenantId, isActive: true } }))?.id);
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

  const message = await prisma.message.create({
    data: {
      conversationId,
      role: parsed.role,
      content: parsed.content,
      mediaUrl: parsed.mediaUrl,
      mediaType: parsed.mediaType,
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

  // Only trigger AI response for automated conversations (not from human operator)
  if (parsed.role === 'USER' && conversation.status === 'ACTIVE' && conversation.agent.isActive && !userId) {
    const withinHours = await isWithinBusinessHours(tenantId);

    if (!withinHours) {
      await offhoursMessageQueue.add('offhours', {
        tenantId,
        conversationId,
        agentName: conversation.agent.name,
      });
      return message;
    }

    const recentMessages = (
      await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: 20,
      })
    ).map((m) => ({ role: m.role.toLowerCase(), content: m.content }));

    await aiResponseQueue.add('generate', {
      agentId: conversation.agentId,
      tenantId,
      conversationId,
      messages: recentMessages,
    });
  }

  // Human operator sending message — always send via WhatsApp
  if (userId && conversation.channel === 'WHATSAPP' && conversation.contactPhone && conversation.status === 'HUMAN_TAKEOVER') {
    const lastUserMsg = await prisma.message.findFirst({
      where: { conversationId, role: 'USER', metadata: { not: null as any } },
      orderBy: { createdAt: 'desc' },
    });
    const metadata = lastUserMsg?.metadata as any;
    const jid = metadata?.jid || `${conversation.contactPhone}@s.whats.net`;
    const sessionId = metadata?.sessionId;

    const whatsappSession = sessionId ? null : await prisma.whatsAppSession.findFirst({
      where: { tenantId, status: 'CONNECTED' },
    });

    const effectiveSessionId = sessionId || whatsappSession?.sessionId;

    if (effectiveSessionId) {
      const { whatsappOutboundQueue } = await import('../workers/queues.js');
      await whatsappOutboundQueue.add('send', {
        sessionId: effectiveSessionId,
        tenantId,
        conversationId,
        jid,
        content: parsed.content,
        messageId: message.id,
      });
    }
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
  if (conversation.status !== 'HUMAN_TAKEOVER') throw new ValidationError('Apenas conversas em takeover podem ser devolvidas ao agente');

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'ACTIVE', assignedTo: null },
  });

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
