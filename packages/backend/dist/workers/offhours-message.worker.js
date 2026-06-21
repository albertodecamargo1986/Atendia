"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOffHoursMessageWorker = startOffHoursMessageWorker;
const bullmq_1 = require("bullmq");
const redis_js_1 = __importDefault(require("../lib/redis.js"));
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const queues_js_1 = require("./queues.js");
const socket_js_1 = require("../lib/socket.js");
function startOffHoursMessageWorker() {
    const worker = new bullmq_1.Worker('offhours-message', async (job) => {
        const { tenantId, conversationId, agentName } = job.data;
        const offHoursText = `No momento estamos fora do horário de atendimento. O agente ${agentName} retornará sua mensagem durante o horário comercial.`;
        const systemMessage = await prisma_js_1.default.message.create({
            data: {
                conversationId,
                role: 'SYSTEM',
                content: offHoursText,
            },
        });
        const io = (0, socket_js_1.getIO)();
        io.to(`tenant:${tenantId}`).emit('message:new', { conversationId, message: systemMessage });
        io.to(`conversation:${conversationId}`).emit('message:new', { conversationId, message: systemMessage });
        // Send off-hours message via WhatsApp too
        const conversation = await prisma_js_1.default.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    where: { role: 'USER' },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });
        if (conversation?.channel === 'WHATSAPP' && conversation.contactPhone) {
            const lastUserMsg = conversation.messages[0];
            const metadata = lastUserMsg?.metadata;
            const jid = metadata?.jid || `${conversation.contactPhone}@s.whats.net`;
            const sessionId = metadata?.sessionId;
            if (sessionId) {
                await queues_js_1.whatsappOutboundQueue.add('send', {
                    sessionId,
                    tenantId,
                    conversationId,
                    jid,
                    content: offHoursText,
                    messageId: systemMessage.id,
                });
            }
        }
        // Update conversation status to PENDING
        await prisma_js_1.default.conversation.update({
            where: { id: conversationId },
            data: { status: 'PENDING' },
        });
        io.to(`tenant:${tenantId}`).emit('conversation:updated', {
            conversation: { id: conversationId, status: 'PENDING' },
        });
        return systemMessage.id;
    }, {
        connection: redis_js_1.default,
        concurrency: 5,
    });
    worker.on('error', (err) => {
        console.error('OffHours Message Worker error:', err.message);
    });
    return worker;
}
//# sourceMappingURL=offhours-message.worker.js.map