"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchTicket = dispatchTicket;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const socket_js_1 = require("../lib/socket.js");
async function dispatchTicket(tenantId, ticketId) {
    const ticket = await prisma_js_1.default.ticket.findUnique({
        where: { id: ticketId },
        include: { queue: { include: { userQueues: { include: { user: true } } } } },
    });
    if (!ticket || ticket.status !== 'PENDING')
        return;
    // If no queue assigned or queue has no users, leave pending for manual pickup
    if (!ticket.queueId || !ticket.queue || ticket.queue.userQueues.length === 0)
        return;
    // Find user in this queue with fewest open tickets (batch query to avoid N+1)
    const candidates = ticket.queue.userQueues.map((uq) => uq.user).filter((u) => u.isActive);
    if (candidates.length === 0)
        return;
    const candidateIds = candidates.map((u) => u.id);
    const ticketCounts = await prisma_js_1.default.ticket.groupBy({
        by: ['assignedTo'],
        where: {
            assignedTo: { in: candidateIds },
            status: { in: ['PENDING', 'OPEN'] },
        },
        _count: true,
    });
    const countMap = new Map(ticketCounts.map((tc) => [tc.assignedTo, tc._count]));
    let bestUser = candidates[0];
    let bestCount = Infinity;
    for (const user of candidates) {
        const count = countMap.get(user.id) || 0;
        if (count < bestCount) {
            bestCount = count;
            bestUser = user;
        }
    }
    // Auto-assign to user with fewest tickets
    const updated = await prisma_js_1.default.ticket.update({
        where: { id: ticketId },
        data: { assignedTo: bestUser.id, status: 'OPEN' },
        include: {
            contact: { select: { id: true, name: true, phone: true } },
            queue: { select: { id: true, name: true, color: true } },
            assignee: { select: { id: true, name: true } },
        },
    });
    const io = (0, socket_js_1.getIO)();
    io.to(`ticket-status:${tenantId}:PENDING`).emit('ticket:delete', { ticketId: ticket.id });
    io.to(`ticket-status:${tenantId}:OPEN`).emit('ticket:create', { ticket: updated });
    io.to(`tenant:${tenantId}`).emit('ticket:update', { ticket: updated });
    io.to(`ticket:${ticketId}`).emit('ticket:update', { ticket: updated });
    io.to(`user:${bestUser.id}`).emit('ticket:assign', { ticket: updated });
}
//# sourceMappingURL=ticket.dispatcher.js.map