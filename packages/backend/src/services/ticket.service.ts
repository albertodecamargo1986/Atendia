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

export async function findOrCreateTicket(
  tenantId: string,
  contactId: string,
  conversationId: string,
  whatsappSessionId: string | null,
  unreadCount: number,
  lastMessage: string,
  isGroup: boolean
) {
  return prisma.$transaction(async (tx) => {
    // 1. Search for existing open/pending ticket for this contact (with row lock)
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
      return tx.ticket.findUnique({ where: { id: ticket.id }, include: { contact: true, queue: true, assignee: true, conversation: { include: { agent: true } } } })!;
    }

    // 2. Search for recently closed ticket (< 2h) — auto-reopen
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
      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'PENDING',
          assignedTo: null,
          closedAt: null,
          unreadMessages: unreadCount,
          lastMessage: lastMessage.substring(0, 255),
        },
      });

      const io = getIO();
      io.to(`tenant:${tenantId}`).emit('ticket:update', { ticket: updated });
      io.to(`ticket-status:${tenantId}:CLOSED`).emit('ticket:delete', { ticketId: ticket.id });
      io.to(`ticket-status:${tenantId}:PENDING`).emit('ticket:create', { ticket: updated });

      await dispatchTicket(tenantId, updated.id);

      return tx.ticket.findUnique({ where: { id: updated.id }, include: { contact: true, queue: true, assignee: true, conversation: { include: { agent: true } } } })!;
    }

    // 3. Create new ticket
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
      include: { contact: true, queue: true, assignee: true, conversation: { include: { agent: true } } },
    });

    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('ticket:create', { ticket: newTicket });
    io.to(`ticket-status:${tenantId}:PENDING`).emit('ticket:create', { ticket: newTicket });

    await dispatchTicket(tenantId, newTicket.id);

    return newTicket;
  }, { isolationLevel: 'Serializable' });
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

  if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;
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
