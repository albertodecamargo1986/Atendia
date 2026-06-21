"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = sendMessage;
exports.getDirectMessages = getDirectMessages;
exports.getGroupMessages = getGroupMessages;
exports.markAsRead = markAsRead;
exports.getUnreadCount = getUnreadCount;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
const socket_js_1 = require("../lib/socket.js");
async function sendMessage(tenantId, senderId, receiverId, groupId, content) {
    // Validate receiver belongs to same tenant
    if (receiverId) {
        const receiver = await prisma_js_1.default.user.findFirst({
            where: { id: receiverId, tenantId, isActive: true },
        });
        if (!receiver)
            throw new errors_js_1.NotFoundError('Destinatário', receiverId);
    }
    const message = await prisma_js_1.default.internalMessage.create({
        data: { tenantId, senderId, receiverId, groupId, content },
        include: {
            sender: { select: { id: true, name: true, avatarUrl: true } },
            receiver: { select: { id: true, name: true, avatarUrl: true } },
        },
    });
    // Emit to tenant-scoped room and directly to the receiver
    const io = (0, socket_js_1.getIO)();
    const payload = { conversationId: groupId || 'direct', message };
    // Tenant room — ensures only users of this tenant receive it
    io.to(`tenant:${tenantId}`).emit('internal-message:new', payload);
    // Direct user room — for push notification to specific receiver
    if (receiverId) {
        io.to(`user:${receiverId}`).emit('internal-message:new', payload);
    }
    return message;
}
async function getDirectMessages(tenantId, userId1, userId2, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where = {
        tenantId,
        groupId: null,
        OR: [
            { senderId: userId1, receiverId: userId2 },
            { senderId: userId2, receiverId: userId1 },
        ],
    };
    const [messages, total] = await Promise.all([
        prisma_js_1.default.internalMessage.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: {
                sender: { select: { id: true, name: true, avatarUrl: true } },
            },
        }),
        prisma_js_1.default.internalMessage.count({ where }),
    ]);
    return { messages: messages.reverse(), total };
}
async function getGroupMessages(tenantId, groupId, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where = { tenantId, groupId };
    const [messages, total] = await Promise.all([
        prisma_js_1.default.internalMessage.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: {
                sender: { select: { id: true, name: true, avatarUrl: true } },
            },
        }),
        prisma_js_1.default.internalMessage.count({ where }),
    ]);
    return { messages: messages.reverse(), total };
}
async function markAsRead(messageId, tenantId, userId) {
    return prisma_js_1.default.internalMessage.updateMany({
        where: { id: messageId, tenantId, receiverId: userId, readAt: null },
        data: { readAt: new Date() },
    });
}
async function getUnreadCount(userId, tenantId) {
    return prisma_js_1.default.internalMessage.count({
        where: { tenantId, receiverId: userId, readAt: null },
    });
}
//# sourceMappingURL=internal-chat.service.js.map