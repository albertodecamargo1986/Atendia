"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConversation = createConversation;
exports.listConversations = listConversations;
exports.getConversation = getConversation;
exports.sendMessage = sendMessage;
exports.escalateConversation = escalateConversation;
exports.returnToAgent = returnToAgent;
exports.transferConversation = transferConversation;
exports.addInternalNote = addInternalNote;
exports.resolveConversation = resolveConversation;
exports.deleteConversation = deleteConversation;
exports.getConversationStats = getConversationStats;
exports.getDailyStats = getDailyStats;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
const socket_js_1 = require("../lib/socket.js");
const queues_js_1 = require("../workers/queues.js");
const business_hours_service_js_1 = require("./business-hours.service.js");
const queues_js_2 = require("../workers/queues.js");
const zod_1 = require("zod");
const ticket_service_js_1 = require("./ticket.service.js");
const sendMessageSchema = zod_1.z.object({
    content: zod_1.z.string().min(1, 'Mensagem nao pode estar vazia'),
    role: zod_1.z.enum(['USER', 'ASSISTANT', 'SYSTEM']).default('USER'),
    mediaUrl: zod_1.z.string().optional(),
    mediaType: zod_1.z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT']).optional(),
});
const createConversationSchema = zod_1.z.object({
    channel: zod_1.z.enum(['WHATSAPP', 'WEB', 'TELEGRAM', 'INSTAGRAM'], { errorMap: () => ({ message: 'Canal inválido' }) }),
    contactName: zod_1.z.string().min(1, 'Nome do contato é obrigatório'),
    contactEmail: zod_1.z.string().email().optional(),
    agentId: zod_1.z.string().optional(),
});
async function createConversation(tenantId, data) {
    const parsed = createConversationSchema.parse(data);
    const agentId = parsed.agentId || ((await prisma_js_1.default.agent.findFirst({ where: { tenantId, isActive: true } }))?.id);
    if (!agentId)
        throw new errors_js_1.ValidationError('Nenhum agente ativo encontrado');
    return prisma_js_1.default.conversation.create({
        data: {
            tenantId,
            agentId,
            channel: parsed.channel,
            contactName: parsed.contactName,
            contactEmail: parsed.contactEmail,
            status: 'ACTIVE',
        },
        include: {
            agent: { select: { id: true, name: true, model: true } },
            _count: { select: { messages: true } },
        },
    });
}
async function listConversations(tenantId, filters) {
    const where = { tenantId };
    if (filters?.status)
        where.status = filters.status;
    if (filters?.agentId)
        where.agentId = filters.agentId;
    const page = filters?.page || 1;
    const limit = 50;
    const offset = limit * (page - 1);
    const [conversations, count] = await Promise.all([
        prisma_js_1.default.conversation.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: limit,
            skip: offset,
            include: {
                agent: { select: { id: true, name: true } },
                operator: { select: { id: true, name: true } },
                _count: { select: { messages: true } },
            },
        }),
        prisma_js_1.default.conversation.count({ where }),
    ]);
    return { conversations, count, hasMore: count > offset + conversations.length };
}
async function getConversation(tenantId, conversationId) {
    const conversation = await prisma_js_1.default.conversation.findFirst({
        where: { id: conversationId, tenantId },
        include: {
            agent: { select: { id: true, name: true, model: true } },
            operator: { select: { id: true, name: true } },
            messages: { orderBy: { createdAt: 'asc' } },
        },
    });
    if (!conversation)
        throw new errors_js_1.NotFoundError('Conversa', conversationId);
    return conversation;
}
async function sendMessage(tenantId, conversationId, data, userId) {
    const parsed = sendMessageSchema.parse(data);
    const conversation = await prisma_js_1.default.conversation.findFirst({
        where: { id: conversationId, tenantId },
        include: { agent: true },
    });
    if (!conversation)
        throw new errors_js_1.NotFoundError('Conversa', conversationId);
    const message = await prisma_js_1.default.message.create({
        data: {
            conversationId,
            role: parsed.role,
            content: parsed.content,
            mediaUrl: parsed.mediaUrl,
            mediaType: parsed.mediaType,
        },
    });
    (0, socket_js_1.getIO)().to(`tenant:${tenantId}`).emit('message:new', { conversationId, message });
    (0, socket_js_1.getIO)().to(`conversation:${conversationId}`).emit('message:new', { conversationId, message });
    // Update ticket if one exists
    const ticket = await prisma_js_1.default.ticket.findUnique({ where: { conversationId } });
    if (ticket) {
        await prisma_js_1.default.ticket.update({
            where: { id: ticket.id },
            data: { lastMessage: parsed.content.substring(0, 255) },
        });
        (0, socket_js_1.getIO)().to(`ticket:${ticket.id}`).emit('message:new', { conversationId, message });
    }
    // Only trigger AI response for automated conversations (not from human operator)
    if (parsed.role === 'USER' && conversation.status === 'ACTIVE' && conversation.agent.isActive && !userId) {
        const withinHours = await (0, business_hours_service_js_1.isWithinBusinessHours)(tenantId);
        if (!withinHours) {
            await queues_js_2.offhoursMessageQueue.add('offhours', {
                tenantId,
                conversationId,
                agentName: conversation.agent.name,
            });
            return message;
        }
        const recentMessages = (await prisma_js_1.default.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            take: 20,
        })).map((m) => ({ role: m.role.toLowerCase(), content: m.content }));
        await queues_js_1.aiResponseQueue.add('generate', {
            agentId: conversation.agentId,
            tenantId,
            conversationId,
            messages: recentMessages,
        });
    }
    // Human operator sending message — always send via WhatsApp
    if (userId && conversation.channel === 'WHATSAPP' && conversation.contactPhone && conversation.status === 'HUMAN_TAKEOVER') {
        const lastUserMsg = await prisma_js_1.default.message.findFirst({
            where: { conversationId, role: 'USER', metadata: { not: null } },
            orderBy: { createdAt: 'desc' },
        });
        const metadata = lastUserMsg?.metadata;
        const jid = metadata?.jid || `${conversation.contactPhone}@s.whats.net`;
        const sessionId = metadata?.sessionId;
        const whatsappSession = sessionId ? null : await prisma_js_1.default.whatsAppSession.findFirst({
            where: { tenantId, status: 'CONNECTED' },
        });
        const effectiveSessionId = sessionId || whatsappSession?.sessionId;
        if (effectiveSessionId) {
            const { whatsappOutboundQueue } = await import('../workers/queues.js');
            await whatsappOutboundQueue.add('send', {
                sessionId: effectiveSessionId,
                tenantId,
                conversationId,
                jid,
                content: parsed.content,
                messageId: message.id,
            });
        }
    }
    return message;
}
async function escalateConversation(tenantId, conversationId, userId) {
    const conversation = await prisma_js_1.default.conversation.findFirst({
        where: { id: conversationId, tenantId },
    });
    if (!conversation)
        throw new errors_js_1.NotFoundError('Conversa', conversationId);
    const updated = await prisma_js_1.default.conversation.update({
        where: { id: conversationId },
        data: {
            status: 'HUMAN_TAKEOVER',
            assignedTo: userId,
        },
    });
    const systemMessage = await prisma_js_1.default.message.create({
        data: {
            conversationId,
            role: 'SYSTEM',
            content: 'Conversa escalonada para atendimento humano.',
        },
    });
    (0, socket_js_1.getIO)().to(`tenant:${tenantId}`).emit('conversation:updated', { conversation: updated });
    (0, socket_js_1.getIO)().to(`conversation:${conversationId}`).emit('message:new', { conversationId, message: systemMessage });
    // Update ticket: assign to user and set OPEN
    const ticket = await prisma_js_1.default.ticket.findUnique({ where: { conversationId } });
    if (ticket) {
        await (0, ticket_service_js_1.updateTicket)(tenantId, ticket.id, { status: 'OPEN', assignedTo: userId });
    }
    return updated;
}
async function returnToAgent(tenantId, conversationId) {
    const conversation = await prisma_js_1.default.conversation.findFirst({
        where: { id: conversationId, tenantId },
        include: { agent: true },
    });
    if (!conversation)
        throw new errors_js_1.NotFoundError('Conversa', conversationId);
    if (conversation.status !== 'HUMAN_TAKEOVER')
        throw new errors_js_1.ValidationError('Apenas conversas em takeover podem ser devolvidas ao agente');
    const updated = await prisma_js_1.default.conversation.update({
        where: { id: conversationId },
        data: { status: 'ACTIVE', assignedTo: null },
    });
    const systemMessage = await prisma_js_1.default.message.create({
        data: {
            conversationId,
            role: 'SYSTEM',
            content: 'Conversa devolvida para o agente de IA.',
        },
    });
    (0, socket_js_1.getIO)().to(`tenant:${tenantId}`).emit('conversation:updated', { conversation: updated });
    (0, socket_js_1.getIO)().to(`conversation:${conversationId}`).emit('message:new', { conversationId, message: systemMessage });
    // Update ticket: set back to PENDING (returns to queue)
    const ticket = await prisma_js_1.default.ticket.findUnique({ where: { conversationId } });
    if (ticket) {
        await (0, ticket_service_js_1.reopenTicket)(tenantId, ticket.id);
    }
    return updated;
}
async function transferConversation(tenantId, conversationId, toUserId) {
    const conversation = await prisma_js_1.default.conversation.findFirst({
        where: { id: conversationId, tenantId },
    });
    if (!conversation)
        throw new errors_js_1.NotFoundError('Conversa', conversationId);
    const targetUser = await prisma_js_1.default.user.findFirst({
        where: { id: toUserId, tenantId, isActive: true },
    });
    if (!targetUser)
        throw new errors_js_1.NotFoundError('Operador', toUserId);
    const updated = await prisma_js_1.default.conversation.update({
        where: { id: conversationId },
        data: { assignedTo: toUserId, status: 'HUMAN_TAKEOVER' },
    });
    const fromName = conversation.assignedTo ? 'outro operador' : 'agente';
    const systemMessage = await prisma_js_1.default.message.create({
        data: {
            conversationId,
            role: 'SYSTEM',
            content: `Conversa transferida de ${fromName} para ${targetUser.name}.`,
        },
    });
    (0, socket_js_1.getIO)().to(`tenant:${tenantId}`).emit('conversation:updated', { conversation: updated });
    (0, socket_js_1.getIO)().to(`conversation:${conversationId}`).emit('message:new', { conversationId, message: systemMessage });
    // Update ticket: transfer to new user
    const ticket = await prisma_js_1.default.ticket.findUnique({ where: { conversationId } });
    if (ticket) {
        await (0, ticket_service_js_1.updateTicket)(tenantId, ticket.id, { assignedTo: toUserId });
    }
    return updated;
}
async function addInternalNote(tenantId, conversationId, content, userId) {
    const conversation = await prisma_js_1.default.conversation.findFirst({
        where: { id: conversationId, tenantId },
    });
    if (!conversation)
        throw new errors_js_1.NotFoundError('Conversa', conversationId);
    const message = await prisma_js_1.default.message.create({
        data: {
            conversationId,
            role: 'SYSTEM',
            content: `[Nota Interna] ${content}`,
            metadata: { isInternalNote: true, userId },
        },
    });
    (0, socket_js_1.getIO)().to(`conversation:${conversationId}`).emit('message:new', { conversationId, message });
    const ticket = await prisma_js_1.default.ticket.findUnique({ where: { conversationId } });
    if (ticket) {
        (0, socket_js_1.getIO)().to(`ticket:${ticket.id}`).emit('message:new', { conversationId, message });
    }
    return message;
}
async function resolveConversation(tenantId, conversationId) {
    const conversation = await prisma_js_1.default.conversation.findFirst({
        where: { id: conversationId, tenantId },
    });
    if (!conversation)
        throw new errors_js_1.NotFoundError('Conversa', conversationId);
    const updated = await prisma_js_1.default.conversation.update({
        where: { id: conversationId },
        data: { status: 'RESOLVED' },
    });
    (0, socket_js_1.getIO)().to(`tenant:${tenantId}`).emit('conversation:updated', { conversation: updated });
    // Close ticket
    const ticket = await prisma_js_1.default.ticket.findUnique({ where: { conversationId } });
    if (ticket) {
        await (0, ticket_service_js_1.closeTicket)(tenantId, ticket.id);
    }
    return updated;
}
async function deleteConversation(tenantId, conversationId) {
    const conversation = await prisma_js_1.default.conversation.findFirst({
        where: { id: conversationId, tenantId },
    });
    if (!conversation)
        throw new errors_js_1.NotFoundError('Conversa', conversationId);
    // Delete associated ticket first if exists
    const ticket = await prisma_js_1.default.ticket.findUnique({ where: { conversationId } });
    if (ticket) {
        await prisma_js_1.default.ticketTag.deleteMany({ where: { ticketId: ticket.id } });
        await prisma_js_1.default.ticketRating.deleteMany({ where: { ticketId: ticket.id } });
        await prisma_js_1.default.ticket.delete({ where: { id: ticket.id } });
    }
    // Delete all messages then the conversation
    await prisma_js_1.default.message.deleteMany({ where: { conversationId } });
    await prisma_js_1.default.conversation.delete({ where: { id: conversationId } });
    (0, socket_js_1.getIO)().to(`tenant:${tenantId}`).emit('conversation:deleted', { conversationId });
}
async function getConversationStats(tenantId) {
    const [active, pending, resolved, takeover] = await Promise.all([
        prisma_js_1.default.conversation.count({ where: { tenantId, status: 'ACTIVE' } }),
        prisma_js_1.default.conversation.count({ where: { tenantId, status: 'PENDING' } }),
        prisma_js_1.default.conversation.count({ where: { tenantId, status: 'RESOLVED' } }),
        prisma_js_1.default.conversation.count({ where: { tenantId, status: 'HUMAN_TAKEOVER' } }),
    ]);
    return { active, pending, resolved, takeover, total: active + pending + resolved + takeover };
}
async function getDailyStats(tenantId, days = 14) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const [conversations, tickets] = await Promise.all([
        prisma_js_1.default.conversation.findMany({
            where: { tenantId, createdAt: { gte: since } },
            select: { createdAt: true, status: true },
        }),
        prisma_js_1.default.ticket.findMany({
            where: { tenantId, createdAt: { gte: since } },
            select: { createdAt: true, status: true },
        }),
    ]);
    const dailyMap = new Map();
    for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (days - 1 - i));
        const key = d.toISOString().slice(0, 10);
        dailyMap.set(key, { conversations: 0, tickets: 0, resolved: 0 });
    }
    for (const c of conversations) {
        const key = c.createdAt.toISOString().slice(0, 10);
        const entry = dailyMap.get(key);
        if (entry)
            entry.conversations++;
        if (c.status === 'RESOLVED') {
            const dayKey = c.createdAt.toISOString().slice(0, 10);
            const resEntry = dailyMap.get(dayKey);
            if (resEntry)
                resEntry.resolved++;
        }
    }
    for (const t of tickets) {
        const key = t.createdAt.toISOString().slice(0, 10);
        const entry = dailyMap.get(key);
        if (entry)
            entry.tickets++;
    }
    return Array.from(dailyMap.entries()).map(([date, data]) => ({ date, ...data }));
}
//# sourceMappingURL=conversation.service.js.map