"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createQueue = createQueue;
exports.updateQueue = updateQueue;
exports.deleteQueue = deleteQueue;
exports.listQueues = listQueues;
exports.addUserToQueue = addUserToQueue;
exports.removeUserFromQueue = removeUserFromQueue;
exports.addWhatsappToQueue = addWhatsappToQueue;
exports.removeWhatsappFromQueue = removeWhatsappFromQueue;
exports.getQueueForWhatsapp = getQueueForWhatsapp;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const zod_1 = require("zod");
const errors_js_1 = require("../lib/errors.js");
const createQueueSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    color: zod_1.z.string().default('#6366f1'),
    greetingMessage: zod_1.z.string().optional(),
});
const updateQueueSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    color: zod_1.z.string().optional(),
    greetingMessage: zod_1.z.string().nullable().optional(),
});
async function createQueue(tenantId, data) {
    const parsed = createQueueSchema.parse(data);
    return prisma_js_1.default.queue.create({
        data: {
            tenantId,
            name: parsed.name,
            color: parsed.color,
            greetingMessage: parsed.greetingMessage,
        },
    });
}
async function updateQueue(tenantId, queueId, data) {
    const queue = await prisma_js_1.default.queue.findFirst({ where: { id: queueId, tenantId } });
    if (!queue)
        throw new errors_js_1.NotFoundError('Fila', queueId);
    const parsed = updateQueueSchema.parse(data);
    return prisma_js_1.default.queue.update({
        where: { id: queueId },
        data: parsed,
    });
}
async function deleteQueue(tenantId, queueId) {
    const queue = await prisma_js_1.default.queue.findFirst({ where: { id: queueId, tenantId } });
    if (!queue)
        throw new errors_js_1.NotFoundError('Fila', queueId);
    const openTickets = await prisma_js_1.default.ticket.count({
        where: { queueId, status: { in: ['PENDING', 'OPEN'] } },
    });
    if (openTickets > 0) {
        throw new errors_js_1.ValidationError(`Não é possível remover fila com ${openTickets} ticket(s) aberto(s)`);
    }
    return prisma_js_1.default.queue.delete({ where: { id: queueId } });
}
async function listQueues(tenantId) {
    const queues = await prisma_js_1.default.queue.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
        include: {
            _count: { select: { tickets: true } },
            userQueues: {
                include: { user: { select: { id: true, name: true, email: true } } },
            },
            whatsappQueues: {
                include: { whatsappSession: { select: { id: true, phoneNumber: true, status: true } } },
            },
        },
    });
    return queues.map((q) => ({
        id: q.id,
        name: q.name,
        color: q.color,
        greetingMessage: q.greetingMessage,
        ticketCount: q._count.tickets,
        users: q.userQueues.map((uq) => uq.user),
        whatsapps: q.whatsappQueues.map((wq) => wq.whatsappSession),
    }));
}
async function addUserToQueue(userId, queueId) {
    return prisma_js_1.default.userQueue.upsert({
        where: { userId_queueId: { userId, queueId } },
        update: {},
        create: { userId, queueId },
    });
}
async function removeUserFromQueue(userId, queueId) {
    return prisma_js_1.default.userQueue.delete({
        where: { userId_queueId: { userId, queueId } },
    }).catch(() => null);
}
async function addWhatsappToQueue(whatsappSessionId, queueId) {
    return prisma_js_1.default.whatsappQueue.upsert({
        where: { whatsappSessionId_queueId: { whatsappSessionId, queueId } },
        update: {},
        create: { whatsappSessionId, queueId },
    });
}
async function removeWhatsappFromQueue(whatsappSessionId, queueId) {
    return prisma_js_1.default.whatsappQueue.delete({
        where: { whatsappSessionId_queueId: { whatsappSessionId, queueId } },
    }).catch(() => null);
}
async function getQueueForWhatsapp(tenantId, whatsappSessionId) {
    const wq = await prisma_js_1.default.whatsappQueue.findFirst({
        where: { whatsappSessionId },
        include: { queue: true },
    });
    return wq?.queue || null;
}
//# sourceMappingURL=queue.service.js.map