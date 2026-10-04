import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { getIO } from '../lib/socket.js';
import { dispatchTicket } from './ticket.dispatcher.js';
import { subHours } from 'date-fns';
import { emitWebhookEvent } from './webhook.service.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['OPEN', 'CLOSED'],
  OPEN: ['CLOSED'],
  CLOSED: ['PENDING'],
};

const TICKET_INCLUDE = { contact: true, queue: true, assignee: true, conversation: { include: { agent: true } } } as const;

export type TicketOutcome = 'existing' | 'reopened' | 'created';

/** Janela em que um atendimento encerrado é reaberto quando o cliente volta a escrever. */
export const REOPEN_WINDOW_HOURS = 2;

export interface FindOrCreateTicketResult {
  ticket: any;
  outcome: TicketOutcome;
  /** true só quando o atendimento foi CRIADO agora (ex.: dispara saudação da fila). */
  created: boolean;
}

function loadTicket(tx: any, id: string): Promise<any> {
  return tx.ticket.findUnique({ where: { id }, include: TICKET_INCLUDE });
}

/**
 * Atendimento da conversa onde a mensagem chegou. Nunca cria um 2º ticket para a mesma
 * conversa (conversationId é único — evita P2002) e o ticket SEMPRE aponta para a conversa
 * onde chegam as mensagens:
 *   1. a conversa já tem ticket → aberto: atualiza; encerrado: reabre;
 *   2. o contato tem ticket aberto em outra conversa → passa a apontar para esta;
 *   3. o contato tem ticket encerrado há < 2 h → reabre e aponta para esta;
 *   4. senão → cria.
 * A transação (Serializable) só faz leituras/escritas no banco; eventos de socket, webhook e
 * o despacho automático (dispatchTicket, que usa o prisma global) rodam DEPOIS do commit.
 */
export async function findOrCreateTicket(
  tenantId: string,
  contactId: string,
  conversationId: string,
  whatsappSessionId: string | null,
  unreadCount: number,
  lastMessage: string,
  isGroup: boolean
): Promise<FindOrCreateTicketResult> {
  const preview = (lastMessage || '').substring(0, 255);
  const reopenData = {
    status: 'PENDING' as const,
    assignedTo: null,
    closedAt: null,
    unreadMessages: unreadCount,
    lastMessage: preview,
  };
  const sessionData = whatsappSessionId ? { whatsappSessionId } : {};

  const runTx = () => prisma.$transaction(async (tx) => {
    // 1. Ticket desta conversa (único por conversa)
    const own = await tx.ticket.findUnique({ where: { conversationId } });
    if (own && own.tenantId === tenantId) {
      if (own.status === 'CLOSED') {
        await tx.ticket.update({ where: { id: own.id }, data: { ...reopenData, ...sessionData } });
        return { ticket: await loadTicket(tx, own.id), outcome: 'reopened' as TicketOutcome };
      }
      await tx.ticket.update({
        where: { id: own.id },
        data: { unreadMessages: { increment: unreadCount }, lastMessage: preview },
      });
      return { ticket: await loadTicket(tx, own.id), outcome: 'existing' as TicketOutcome };
    }

    // 2. Atendimento aberto/pendente do contato em outra conversa → segue a conversa nova
    const open = await tx.ticket.findFirst({
      where: { tenantId, contactId, status: { in: ['PENDING', 'OPEN'] } },
      orderBy: { updatedAt: 'desc' },
    });
    if (open) {
      await tx.ticket.update({
        where: { id: open.id },
        data: {
          conversationId,
          unreadMessages: { increment: unreadCount },
          lastMessage: preview,
          ...sessionData,
        },
      });
      return { ticket: await loadTicket(tx, open.id), outcome: 'existing' as TicketOutcome };
    }

    // 3. Encerrado há menos de 2 h → reabre (e aponta para esta conversa)
    const recentClosed = await tx.ticket.findFirst({
      where: {
        tenantId,
        contactId,
        status: 'CLOSED',
        updatedAt: { gte: subHours(new Date(), REOPEN_WINDOW_HOURS) },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (recentClosed) {
      await tx.ticket.update({
        where: { id: recentClosed.id },
        data: { ...reopenData, conversationId, ...sessionData },
      });
      return { ticket: await loadTicket(tx, recentClosed.id), outcome: 'reopened' as TicketOutcome };
    }

    // 4. Novo atendimento
    const newTicket = await tx.ticket.create({
      data: {
        tenantId,
        conversationId,
        contactId,
        whatsappSessionId,
        status: 'PENDING',
        unreadMessages: unreadCount,
        lastMessage: preview,
        isGroup,
      },
      include: TICKET_INCLUDE,
    });
    return { ticket: newTicket as any, outcome: 'created' as TicketOutcome };
  }, { isolationLevel: 'Serializable' });

  let result: Awaited<ReturnType<typeof runTx>>;
  try {
    result = await runTx();
  } catch (err: any) {
    // Conflito de serialização / corrida na criação (mensagens simultâneas do mesmo contato):
    // tenta de novo — na 2ª vez o passo 1 encontra o ticket criado pela outra transação.
    if (err?.code === 'P2034' || err?.code === 'P2002') {
      result = await runTx();
    } else {
      throw err;
    }
  }

  const { ticket, outcome } = result;
  if (!ticket) return { ticket, outcome, created: false };

  // ── Após o commit: sockets + webhook + distribuição automática ──
  if (outcome !== 'existing') {
    try {
      const io = getIO();
      if (outcome === 'reopened') {
        io.to(`tenant:${tenantId}`).emit('ticket:update', { ticket });
        io.to(`ticket-status:${tenantId}:CLOSED`).emit('ticket:delete', { ticketId: ticket.id });
      } else {
        io.to(`tenant:${tenantId}`).emit('ticket:create', { ticket });
      }
      io.to(`ticket-status:${tenantId}:PENDING`).emit('ticket:create', { ticket });
    } catch { /* socket indisponível não impede o atendimento */ }

    if (outcome === 'created') {
      emitWebhookEvent(tenantId, 'ticket.created', {
        ticketId: ticket.id,
        conversationId: ticket.conversationId,
        contactId: ticket.contactId,
        contactName: ticket.contact?.name,
        contactPhone: ticket.contact?.phone,
        whatsappSessionId: ticket.whatsappSessionId,
        lastMessage: ticket.lastMessage,
      });
    }

    await dispatchTicket(tenantId, ticket.id);
  }

  return { ticket, outcome, created: outcome === 'created' };
}


const DEFAULT_PAGE_SIZE = 40;

/** Filtro de um valor ou de vários (vira `{ in: [...] }`). */
function oneOrMany(value: string | string[] | undefined) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return value.length === 1 ? value[0] : { in: value };
  }
  return value;
}

export async function listTickets(
  tenantId: string,
  filters: {
    /** Status do atendimento (PENDING, OPEN, CLOSED); aceita vários. */
    status?: string | string[];
    /** Status da conversa: quem está respondendo (ACTIVE = IA, HUMAN_TAKEOVER = pessoa...); aceita vários. */
    aiStatus?: string | string[];
    queueId?: string;
    assignedTo?: string;
    search?: string;
    page?: number;
    withUnreadMessages?: boolean;
  } = {}
) {
  const page = filters.page || 1;
  const limit = DEFAULT_PAGE_SIZE;
  const offset = limit * (page - 1);

  const where: any = { tenantId };

  const status = oneOrMany(filters.status);
  if (status) where.status = status;
  const aiStatus = oneOrMany(filters.aiStatus);
  if (aiStatus) where.conversation = { status: aiStatus };
  if (filters.queueId) where.queueId = filters.queueId;
  if (filters.assignedTo) where.assignedTo = filters.assignedTo;
  if (filters.withUnreadMessages) where.unreadMessages = { gt: 0 };

  if (filters.search) {
    const search = filters.search.toLowerCase();
    where.OR = [
      { contact: { name: { contains: search, mode: 'insensitive' } } },
      { contact: { phone: { contains: search, mode: 'insensitive' } } },
      { lastMessage: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [tickets, count] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        contact: { select: { id: true, name: true, phone: true, profilePicUrl: true } },
        queue: { select: { id: true, name: true, color: true } },
        assignee: { select: { id: true, name: true } },
        conversation: { select: { id: true, channel: true, status: true, agent: { select: { id: true, name: true } } } },
        ticketTags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    }),
    prisma.ticket.count({ where }),
  ]);

  return { tickets, count, hasMore: count > offset + tickets.length };
}

export async function getTicket(tenantId: string, ticketId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    include: {
      contact: true,
      queue: true,
      assignee: { select: { id: true, name: true, email: true } },
      conversation: {
        include: {
          agent: { select: { id: true, name: true } },
          messages: { orderBy: { createdAt: 'asc' } },
        },
      },
      ticketTags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });
  if (!ticket) throw new NotFoundError('Ticket', ticketId);
  return ticket;
}

export async function updateTicket(
  tenantId: string,
  ticketId: string,
  data: { status?: string; assignedTo?: string | null; queueId?: string | null }
) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
  if (!ticket) throw new NotFoundError('Ticket', ticketId);

  const oldStatus = ticket.status;
  const oldAssignedTo = ticket.assignedTo;

  const updateData: any = {};

  // Validate status transition (state machine)
  if (data.status && data.status !== oldStatus) {
    const allowed = VALID_TRANSITIONS[oldStatus];
    if (!allowed || !allowed.includes(data.status)) {
      throw new ValidationError(`Transição de status inválida: ${oldStatus} → ${data.status}. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`);
    }
    updateData.status = data.status;

    // OPEN requires assignedTo
    if (data.status === 'OPEN' && !data.assignedTo && !ticket.assignedTo) {
      throw new ValidationError('Ticket OPEN requer um atendente (assignedTo)');
    }
  }

  // IDOR: atendente e fila precisam ser do mesmo tenant
  if (data.assignedTo) {
    const assignee = await prisma.user.findFirst({
      where: { id: data.assignedTo, tenantId, isActive: true },
      select: { id: true },
    });
    if (!assignee) throw new NotFoundError('Atendente', data.assignedTo);
  }
  if (data.queueId) {
    const queue = await prisma.queue.findFirst({ where: { id: data.queueId, tenantId }, select: { id: true } });
    if (!queue) throw new NotFoundError('Fila', data.queueId);
  }

  if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo || null;
  if (data.queueId !== undefined) updateData.queueId = data.queueId || null;

  if (data.status === 'CLOSED' && oldStatus !== 'CLOSED') {
    updateData.closedAt = new Date();
  }
  if (data.status === 'PENDING' && oldStatus === 'CLOSED') {
    updateData.closedAt = null;
    updateData.assignedTo = null;
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: updateData,
    include: {
      contact: { select: { id: true, name: true, phone: true, profilePicUrl: true } },
      queue: { select: { id: true, name: true, color: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  const io = getIO();

  if (oldStatus !== updated.status) {
    io.to(`ticket-status:${tenantId}:${oldStatus}`).emit('ticket:delete', { ticketId: ticket.id });
    io.to(`ticket-status:${tenantId}:${updated.status}`).emit('ticket:create', { ticket: updated });
  }

  io.to(`tenant:${tenantId}`).emit('ticket:update', { ticket: updated });
  io.to(`ticket:${ticketId}`).emit('ticket:update', { ticket: updated });

  if (updated.assignedTo && updated.assignedTo !== oldAssignedTo) {
    io.to(`user:${updated.assignedTo}`).emit('ticket:assign', { ticket: updated });
  }

  return updated;
}

export async function acceptTicket(tenantId: string, ticketId: string, userId: string) {
  return updateTicket(tenantId, ticketId, { status: 'OPEN', assignedTo: userId });
}

/**
 * Encerra o atendimento e devolve a conversa (RESOLVED). Quando o cliente voltar a
 * escrever, a conversa é reativada / o ticket reaberto (findOrCreateTicket) em vez de
 * ficar preso a um atendimento fechado.
 */
export async function closeTicket(tenantId: string, ticketId: string) {
  const updated = await updateTicket(tenantId, ticketId, { status: 'CLOSED' });
  const conversation = await prisma.conversation.findFirst({
    where: { id: updated.conversationId, tenantId },
    select: { id: true, status: true },
  });
  if (conversation && conversation.status !== 'RESOLVED') {
    const resolved = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'RESOLVED', assignedTo: null },
    });
    try {
      getIO().to(`tenant:${tenantId}`).emit('conversation:updated', { conversation: resolved });
    } catch { /* socket indisponível */ }
  }
  emitWebhookEvent(tenantId, 'ticket.closed', {
    ticketId: updated.id,
    conversationId: updated.conversationId,
    contactId: updated.contactId,
    contactName: updated.contact?.name,
    contactPhone: updated.contact?.phone,
    closedAt: updated.closedAt,
  });
  return updated;
}

/** Reabre o atendimento; se a conversa estava encerrada, volta para a IA (ACTIVE). */
export async function reopenTicket(tenantId: string, ticketId: string) {
  const updated = await updateTicket(tenantId, ticketId, { status: 'PENDING', assignedTo: null });
  const conversation = await prisma.conversation.findFirst({
    where: { id: updated.conversationId, tenantId },
    select: { id: true, status: true },
  });
  if (conversation?.status === 'RESOLVED') {
    const reactivated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'ACTIVE' },
    });
    try {
      getIO().to(`tenant:${tenantId}`).emit('conversation:updated', { conversation: reactivated });
    } catch { /* socket indisponível */ }
  }
  await dispatchTicket(tenantId, ticketId);
  return updated;
}

export async function markAsRead(tenantId: string, ticketId: string) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
  if (!ticket) throw new NotFoundError('Ticket', ticketId);

  return prisma.ticket.update({
    where: { id: ticketId },
    data: { unreadMessages: 0 },
  });
}

/** Atendimentos em andamento (não encerrados). */
const ACTIVE_TICKET = { in: ['PENDING', 'OPEN'] as ('PENDING' | 'OPEN')[] };
/** Conversa sem a IA respondendo: uma pessoa assumiu (PENDING é legado — migrado para ACTIVE). */
export const WAITING_HUMAN_AI_STATUS = ['HUMAN_TAKEOVER', 'PENDING'] as const;

export async function getTicketStats(tenantId: string, userId?: string) {
  const [pending, open, closed, withUnread, aiActive, waitingHuman, mine] = await Promise.all([
    prisma.ticket.count({ where: { tenantId, status: 'PENDING' } }),
    prisma.ticket.count({ where: { tenantId, status: 'OPEN' } }),
    prisma.ticket.count({ where: { tenantId, status: 'CLOSED' } }),
    prisma.ticket.count({ where: { tenantId, unreadMessages: { gt: 0 } } }),
    prisma.ticket.count({ where: { tenantId, status: ACTIVE_TICKET, conversation: { status: 'ACTIVE' } } }),
    prisma.ticket.count({
      where: { tenantId, status: ACTIVE_TICKET, conversation: { status: { in: [...WAITING_HUMAN_AI_STATUS] } } },
    }),
    userId
      ? prisma.ticket.count({ where: { tenantId, status: ACTIVE_TICKET, assignedTo: userId } })
      : Promise.resolve(0),
  ]);

  return { pending, open, closed, total: pending + open + closed, withUnread, aiActive, waitingHuman, mine };
}

export async function getTicketCountByQueue(tenantId: string) {
  const queues = await prisma.queue.findMany({
    where: { tenantId },
    include: { _count: { select: { tickets: { where: { status: { in: ['PENDING', 'OPEN'] } } } } } },
    orderBy: { name: 'asc' },
  });

  return queues.map((q) => ({
    id: q.id,
    name: q.name,
    color: q.color,
    count: q._count.tickets,
  }));
}
