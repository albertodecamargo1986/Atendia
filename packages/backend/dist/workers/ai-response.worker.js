"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAIResponseWorker = startAIResponseWorker;
const bullmq_1 = require("bullmq");
const redis_js_1 = __importDefault(require("../lib/redis.js"));
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const ai_service_js_1 = require("../services/ai.service.js");
const queues_js_1 = require("./queues.js");
const socket_js_1 = require("../lib/socket.js");
const voice_service_js_1 = require("../services/voice.service.js");
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function startAIResponseWorker() {
    const worker = new bullmq_1.Worker('ai-response', async (job) => {
        const { agentId, tenantId, conversationId, messages } = job.data;
        // Fetch agent config for delay + audio settings
        const agent = await prisma_js_1.default.agent.findFirst({
            where: { id: agentId, tenantId },
            include: { voiceProfile: true },
        });
        if (!agent)
            throw new Error('Agente não encontrado');
        if (!agent.isActive)
            throw new Error('Agente inativo');
        const io = (0, socket_js_1.getIO)();
        // Emit typing indicator
        io.to(`conversation:${conversationId}`).emit('agent:typing', { conversationId });
        io.to(`tenant:${tenantId}`).emit('agent:typing', { conversationId });
        // Humanized delay
        const delayMin = agent.responseDelayMinMs || 1000;
        const delayMax = agent.responseDelayMaxMs || 4000;
        const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
        await sleep(delay);
        // Generate AI response
        const aiContent = await (0, ai_service_js_1.generateResponse)(agentId, tenantId, messages);
        // Stop typing indicator
        io.to(`conversation:${conversationId}`).emit('agent:stopped-typing', { conversationId });
        io.to(`tenant:${tenantId}`).emit('agent:stopped-typing', { conversationId });
        // Create message in DB
        const aiMessage = await prisma_js_1.default.message.create({
            data: {
                conversationId,
                role: 'ASSISTANT',
                content: aiContent,
            },
        });
        io.to(`tenant:${tenantId}`).emit('message:new', { conversationId, message: aiMessage });
        io.to(`conversation:${conversationId}`).emit('message:new', { conversationId, message: aiMessage });
        // Send AI response back via WhatsApp if the conversation is on that channel
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
                // Check if we should send audio instead of (or alongside) text
                const shouldSendAudio = agent.sendAudioFrequency > 0;
                let sendAudioThisTurn = false;
                if (shouldSendAudio) {
                    const assistantCount = await prisma_js_1.default.message.count({
                        where: {
                            conversationId,
                            role: 'ASSISTANT',
                        },
                    });
                    sendAudioThisTurn = assistantCount % agent.sendAudioFrequency === 0;
                }
                if (sendAudioThisTurn && agent.voiceProfile) {
                    try {
                        const audioPath = await (0, voice_service_js_1.generateAudioResponse)(aiContent, agent.voiceProfile.voiceId, tenantId, agent.voiceProfile.provider);
                        await queues_js_1.whatsappOutboundQueue.add('send-audio', {
                            sessionId,
                            tenantId,
                            conversationId,
                            jid,
                            content: aiContent,
                            audioPath,
                            messageId: aiMessage.id,
                        });
                    }
                    catch (err) {
                        console.error('Audio generation failed, falling back to text:', err.message);
                        await queues_js_1.whatsappOutboundQueue.add('send', {
                            sessionId,
                            tenantId,
                            conversationId,
                            jid,
                            content: aiContent,
                            messageId: aiMessage.id,
                        });
                    }
                }
                else if (sendAudioThisTurn && !agent.voiceProfile) {
                    // No voice profile configured but frequency > 0 — use OpenAI TTS as fallback
                    try {
                        const audioPath = await (0, voice_service_js_1.generateAudioResponse)(aiContent, 'nova', tenantId, 'openai');
                        await queues_js_1.whatsappOutboundQueue.add('send-audio', {
                            sessionId,
                            tenantId,
                            conversationId,
                            jid,
                            content: aiContent,
                            audioPath,
                            messageId: aiMessage.id,
                        });
                    }
                    catch (err) {
                        console.error('OpenAI TTS fallback failed, sending text:', err.message);
                        await queues_js_1.whatsappOutboundQueue.add('send', {
                            sessionId,
                            tenantId,
                            conversationId,
                            jid,
                            content: aiContent,
                            messageId: aiMessage.id,
                        });
                    }
                }
                else {
                    // Send text only
                    await queues_js_1.whatsappOutboundQueue.add('send', {
                        sessionId,
                        tenantId,
                        conversationId,
                        jid,
                        content: aiContent,
                        messageId: aiMessage.id,
                    });
                }
            }
        }
        return aiMessage.id;
    }, {
        connection: redis_js_1.default,
        concurrency: 5,
    });
    worker.on('failed', async (job, err) => {
        if (!job)
            return;
        const { tenantId, conversationId } = job.data;
        const io = (0, socket_js_1.getIO)();
        io.to(`conversation:${conversationId}`).emit('agent:stopped-typing', { conversationId });
        if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
            const errorMessage = await prisma_js_1.default.message.create({
                data: {
                    conversationId,
                    role: 'SYSTEM',
                    content: `Erro ao gerar resposta da IA após ${job.attemptsMade} tentativas: ${err.message}`,
                },
            });
            io.to(`conversation:${conversationId}`).emit('message:new', { conversationId, message: errorMessage });
        }
    });
    worker.on('error', (err) => {
        console.error('AI Response Worker error:', err.message);
    });
    return worker;
}
//# sourceMappingURL=ai-response.worker.js.map