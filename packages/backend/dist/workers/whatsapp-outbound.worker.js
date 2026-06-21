"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWhatsAppOutboundWorker = startWhatsAppOutboundWorker;
const bullmq_1 = require("bullmq");
const redis_js_1 = __importDefault(require("../lib/redis.js"));
const whatsapp_service_js_1 = require("../services/whatsapp.service.js");
const socket_js_1 = require("../lib/socket.js");
function startWhatsAppOutboundWorker() {
    const worker = new bullmq_1.Worker('whatsapp-outbound', async (job) => {
        const { sessionId, tenantId, conversationId, jid, content, messageId, audioPath } = job.data;
        try {
            // If audioPath is provided, send as voice message
            if (audioPath) {
                const sent = await (0, whatsapp_service_js_1.sendWhatsAppAudio)(sessionId, jid, audioPath);
                const io = (0, socket_js_1.getIO)();
                io.to(`tenant:${tenantId}`).emit('whatsapp:message-sent', {
                    sessionId,
                    conversationId,
                    messageId,
                    status: 'sent',
                    type: 'audio',
                    sentId: sent?.key?.id,
                });
                return { success: true, messageId, sentId: sent?.key?.id, type: 'audio' };
            }
            // Otherwise send as text
            const sent = await (0, whatsapp_service_js_1.sendWhatsAppMessage)(sessionId, jid, content);
            const io = (0, socket_js_1.getIO)();
            io.to(`tenant:${tenantId}`).emit('whatsapp:message-sent', {
                sessionId,
                conversationId,
                messageId,
                status: 'sent',
                sentId: sent?.key?.id,
            });
            return { success: true, messageId, sentId: sent?.key?.id };
        }
        catch (err) {
            const io = (0, socket_js_1.getIO)();
            io.to(`tenant:${tenantId}`).emit('whatsapp:message-sent', {
                sessionId,
                conversationId,
                messageId,
                status: 'failed',
                error: err.message,
            });
            throw err;
        }
    }, {
        connection: redis_js_1.default,
        concurrency: 10,
    });
    worker.on('failed', (job, err) => {
        if (!job)
            return;
        console.error(`WhatsApp outbound failed for session ${job.data.sessionId}:`, err.message);
    });
    worker.on('error', (err) => {
        console.error('WhatsApp Outbound Worker error:', err.message);
    });
    return worker;
}
//# sourceMappingURL=whatsapp-outbound.worker.js.map