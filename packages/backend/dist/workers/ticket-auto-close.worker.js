"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTicketAutoCloseWorker = startTicketAutoCloseWorker;
const bullmq_1 = require("bullmq");
const redis_js_1 = __importDefault(require("../lib/redis.js"));
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const socket_js_1 = require("../lib/socket.js");
const date_fns_1 = require("date-fns");
function startTicketAutoCloseWorker() {
    const ticketCheckQueue = new bullmq_1.Queue('ticket-auto-check', { connection: redis_js_1.default });
    // Schedule check every 10 minutes
    ticketCheckQueue.add('check', {}, {
        repeat: { every: 600000 },
    });
    const worker = new bullmq_1.Worker('ticket-auto-check', async () => {
        const now = new Date();
        // Find tickets PENDING for more than 24h — notify supervisors
        const stalePending = await prisma_js_1.default.ticket.findMany({
            where: {
                status: 'PENDING',
                createdAt: { lte: (0, date_fns_1.subHours)(now, 24) },
            },
            include: {
                tenant: { select: { id: true } },
                contact: { select: { name: true, phone: true } },
                queue: { select: { name: true } },
            },
            take: 100,
        });
        for (const ticket of stalePending) {
            const io = (0, socket_js_1.getIO)();
            io.to(`tenant:${ticket.tenantId}`).emit('ticket:stale', {
                ticketId: ticket.id,
                contactName: ticket.contact.name,
                queueName: ticket.queue?.name || 'Sem fila',
                hoursWaiting: Math.floor((now.getTime() - ticket.createdAt.getTime()) / 3600000),
            });
        }
    }, { connection: redis_js_1.default });
    worker.on('error', (err) => {
        console.error('Ticket auto-check worker error:', err.message);
    });
    return worker;
}
//# sourceMappingURL=ticket-auto-close.worker.js.map