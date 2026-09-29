import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { getIO } from '../lib/socket.js';
import { dispatchTicket } from './ticket.dispatcher.js';
import { subHours } from 'date-fns';

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['OPEN', 'CLOSED'],
  OPEN: ['CLOSED'],
  CLOSED: ['PENDING'],
};

const TICKET_INCLUDE = { contact: true, queue: true, assignee: true, conversation: { include: { agent: true } } } as const;

type TicketOutcome = 'existing' | 'reopened' | 'created';

/**
 * Busca atendimento aberto/pendente do contato, reabre um fechado há < 2h ou cria um novo.
 * A transação (Serializable) só faz leituras/escritas no banco; eventos de socket e
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
) {
  const runTx = () => prisma.$transaction(async (tx) => {
    // 1. Atendimento aberto/pendente do contato
    let ticket = await tx.ticket.findFirst({
      where: {
        tenantId,
        contactId,
        status: { in: ['PENDING', 'OPEN'] },
      },
    });

    if (ticket) {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          unreadMessages: { increment: unreadCount },
          lastMessage: lastMessage.substring(0, 255),
        },
      });
      const found = await tx.ticket.findUnique({ where: { id: ticket.id }, include: TICKET_INCLUDE });
      return { ticket: found, outcome: 'existing' as TicketOutcome };
    }

    // 2. Fechado há menos de 2h → reabre
    ticket = await tx.ticket.findFirst({
      where: {
        tenantId,
        contactId,
        status: 'CLOSED',
        updatedAt: { gte: subHours(new Date(), 2) },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (ticket) {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'PENDING',
          assignedTo: null,
          closedAt: null,
          unreadMessages: unreadCount,
          lastMessage: lastMessage.substring(0, 255),
        },
      });
      const reopened = await tx.ticket.findUnique({ where: { id: ticket.id }, include: TICKET_INCLUDE });
      return { ticket: reopened, outcome: 'reopened' as TicketOutcome };
    }

    // 3. Novo atendimento
    const newTicket = await tx.ticket.create({
      data: {
        tenantId,
        conversationId,
        contactId,
        whatsappSessionId,
        status: 'PENDING',
        unreadMessages: unreadCount,
        lastMessage: lastMessage.substring(0, 255),
        isGroup,
      },
      include: TICKET_INCLUDE,
    });
    return { ticket: newTicket, outcome: 'created' as TicketOutcome };
  }, { isolationLevel: 'Serializable' });

  let result: Awaited<ReturnType<typeof runTx>>;
  try {
    result = await runTx();
  } catch (err: any) {
    // Conflito de serialização (mensagens simultâneas do mesmo contato): tenta de novo uma vez
    if (err?.code === 'P2034') {
      result = await runTx();
    } else {
      throw err;
    }
  }

  const { ticket, outcome } = result;
  if (!ticket) return ticket;

  // ── Após o commit: sockets + distribuição automática ──
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

    await dispatchTicket(tenantId, ticket.id);
  }

  return ticket;
}


const DEFAULT_PAGE_SIZE = 40;

export async function listTickets(
  tenantId: string,
  filters: {
    status?: string;
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

  if (filters.status) where.status = filters.status;
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
        conversation: { select: { id: true, channel: true, agent: { select: { id: true, name: true } } } },
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

export async function closeTicket(tenantId: string, ticketId: string) {
  return updateTicket(tenantId, ticketId, { status: 'CLOSED' });
}

export async function reopenTicket(tenantId: string, ticketId: string) {
  const updated = await updateTicket(tenantId, ticketId, { status: 'PENDING', assignedTo: null });
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

export async function getTicketStats(tenantId: string) {
  const [pending, open, closed] = await Promise.all([
    prisma.ticket.count({ where: { tenantId, status: 'PENDING' } }),
    prisma.ticket.count({ where: { tenantId, status: 'OPEN' } }),
    prisma.ticket.count({ where: { tenantId, status: 'CLOSED' } }),
  ]);

  const withUnread = await prisma.ticket.count({
    where: { tenantId, unreadMessages: { gt: 0 } },
  });

  return { pending, open, closed, total: pending + open + closed, withUnread };
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
