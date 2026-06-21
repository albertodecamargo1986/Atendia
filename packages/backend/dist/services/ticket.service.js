"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOrCreateTicket = findOrCreateTicket;
exports.listTickets = listTickets;
exports.getTicket = getTicket;
exports.updateTicket = updateTicket;
exports.acceptTicket = acceptTicket;
exports.closeTicket = closeTicket;
exports.reopenTicket = reopenTicket;
exports.markAsRead = markAsRead;
exports.getTicketStats = getTicketStats;
exports.getTicketCountByQueue = getTicketCountByQueue;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
const socket_js_1 = require("../lib/socket.js");
const ticket_dispatcher_js_1 = require("./ticket.dispatcher.js");
const date_fns_1 = require("date-fns");
const VALID_TRANSITIONS = {
    PENDING: ['OPEN', 'CLOSED'],
    OPEN: ['CLOSED'],
    CLOSED: ['PENDING'],
};
async function findOrCreateTicket(tenantId, contactId, conversationId, whatsappSessionId, unreadCount, lastMessage, isGroup) {
    return prisma_js_1.default.$transaction(async (tx) => {
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
            return tx.ticket.findUnique({ where: { id: ticket.id }, include: { contact: true, queue: true, assignee: true, conversation: { include: { agent: true } } } });
        }
        // 2. Search for recently closed ticket (< 2h) — auto-reopen
        ticket = await tx.ticket.findFirst({
            where: {
                tenantId,
                contactId,
                status: 'CLOSED',
                updatedAt: { gte: (0, date_fns_1.subHours)(new Date(), 2) },
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
            const io = (0, socket_js_1.getIO)();
            io.to(`tenant:${tenantId}`).emit('ticket:update', { ticket: updated });
            io.to(`ticket-status:${tenantId}:CLOSED`).emit('ticket:delete', { ticketId: ticket.id });
            io.to(`ticket-status:${tenantId}:PENDING`).emit('ticket:create', { ticket: updated });
            await (0, ticket_dispatcher_js_1.dispatchTicket)(tenantId, updated.id);
            return tx.ticket.findUnique({ where: { id: updated.id }, include: { contact: true, queue: true, assignee: true, conversation: { include: { agent: true } } } });
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
        const io = (0, socket_js_1.getIO)();
        io.to(`tenant:${tenantId}`).emit('ticket:create', { ticket: newTicket });
        io.to(`ticket-status:${tenantId}:PENDING`).emit('ticket:create', { ticket: newTicket });
        await (0, ticket_dispatcher_js_1.dispatchTicket)(tenantId, newTicket.id);
        return newTicket;
    }, { isolationLevel: 'Serializable' });
}
const DEFAULT_PAGE_SIZE = 40;
async function listTickets(tenantId, filters = {}) {
    const page = filters.page || 1;
    const limit = DEFAULT_PAGE_SIZE;
    const offset = limit * (page - 1);
    const where = { tenantId };
    if (filters.status)
        where.status = filters.status;
    if (filters.queueId)
        where.queueId = filters.queueId;
    if (filters.assignedTo)
        where.assignedTo = filters.assignedTo;
    if (filters.withUnreadMessages)
        where.unreadMessages = { gt: 0 };
    if (filters.search) {
        const search = filters.search.toLowerCase();
        where.OR = [
            { contact: { name: { contains: search, mode: 'insensitive' } } },
            { contact: { phone: { contains: search, mode: 'insensitive' } } },
            { lastMessage: { contains: search, mode: 'insensitive' } },
        ];
    }
    const [tickets, count] = await Promise.all([
        prisma_js_1.default.ticket.findMany({
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
        prisma_js_1.default.ticket.count({ where }),
    ]);
    return { tickets, count, hasMore: count > offset + tickets.length };
}
async function getTicket(tenantId, ticketId) {
    const ticket = await prisma_js_1.default.ticket.findFirst({
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
    if (!ticket)
        throw new errors_js_1.NotFoundError('Ticket', ticketId);
    return ticket;
}
async function updateTicket(tenantId, ticketId, data) {
    const ticket = await prisma_js_1.default.ticket.findFirst({ where: { id: ticketId, tenantId } });
    if (!ticket)
        throw new errors_js_1.NotFoundError('Ticket', ticketId);
    const oldStatus = ticket.status;
    const oldAssignedTo = ticket.assignedTo;
    const updateData = {};
    // Validate status transition (state machine)
    if (data.status && data.status !== oldStatus) {
        const allowed = VALID_TRANSITIONS[oldStatus];
        if (!allowed || !allowed.includes(data.status)) {
            throw new errors_js_1.ValidationError(`Transição de status inválida: ${oldStatus} → ${data.status}. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`);
        }
        updateData.status = data.status;
        // OPEN requires assignedTo
        if (data.status === 'OPEN' && !data.assignedTo && !ticket.assignedTo) {
            throw new errors_js_1.ValidationError('Ticket OPEN requer um atendente (assignedTo)');
        }
    }
    if (data.assignedTo !== undefined)
        updateData.assignedTo = data.assignedTo;
    if (data.queueId !== undefined)
        updateData.queueId = data.queueId || null;
    if (data.status === 'CLOSED' && oldStatus !== 'CLOSED') {
        updateData.closedAt = new Date();
    }
    if (data.status === 'PENDING' && oldStatus === 'CLOSED') {
        updateData.closedAt = null;
        updateData.assignedTo = null;
    }
    const updated = await prisma_js_1.default.ticket.update({
        where: { id: ticketId },
        data: updateData,
        include: {
            contact: { select: { id: true, name: true, phone: true, profilePicUrl: true } },
            queue: { select: { id: true, name: true, color: true } },
            assignee: { select: { id: true, name: true } },
        },
    });
    const io = (0, socket_js_1.getIO)();
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
async function acceptTicket(tenantId, ticketId, userId) {
    return updateTicket(tenantId, ticketId, { status: 'OPEN', assignedTo: userId });
}
async function closeTicket(tenantId, ticketId) {
    return updateTicket(tenantId, ticketId, { status: 'CLOSED' });
}
async function reopenTicket(tenantId, ticketId) {
    const updated = await updateTicket(tenantId, ticketId, { status: 'PENDING', assignedTo: null });
    await (0, ticket_dispatcher_js_1.dispatchTicket)(tenantId, ticketId);
    return updated;
}
async function markAsRead(tenantId, ticketId) {
    const ticket = await prisma_js_1.default.ticket.findFirst({ where: { id: ticketId, tenantId } });
    if (!ticket)
        throw new errors_js_1.NotFoundError('Ticket', ticketId);
    return prisma_js_1.default.ticket.update({
        where: { id: ticketId },
        data: { unreadMessages: 0 },
    });
}
async function getTicketStats(tenantId) {
    const [pending, open, closed] = await Promise.all([
        prisma_js_1.default.ticket.count({ where: { tenantId, status: 'PENDING' } }),
        prisma_js_1.default.ticket.count({ where: { tenantId, status: 'OPEN' } }),
        prisma_js_1.default.ticket.count({ where: { tenantId, status: 'CLOSED' } }),
    ]);
    const withUnread = await prisma_js_1.default.ticket.count({
        where: { tenantId, unreadMessages: { gt: 0 } },
    });
    return { pending, open, closed, total: pending + open + closed, withUnread };
}
async function getTicketCountByQueue(tenantId) {
    const queues = await prisma_js_1.default.queue.findMany({
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
//# sourceMappingURL=ticket.service.js.map