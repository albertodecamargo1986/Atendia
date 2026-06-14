import prisma from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import { getIO } from '../lib/socket.js';

export async function sendMessage(tenantId: string, senderId: string, receiverId: string | null, groupId: string | null, content: string) {
  // Validate receiver belongs to same tenant
  if (receiverId) {
    const receiver = await prisma.user.findFirst({
      where: { id: receiverId, tenantId, isActive: true },
    });
    if (!receiver) throw new NotFoundError('Destinatário', receiverId);
  }

  const message = await prisma.internalMessage.create({
    data: { tenantId, senderId, receiverId, groupId, content },
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } },
      receiver: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  // Emit to tenant-scoped room and directly to the receiver
  const io = getIO();
  const payload = { conversationId: groupId || 'direct', message };

  // Tenant room — ensures only users of this tenant receive it
  io.to(`tenant:${tenantId}`).emit('internal-message:new', payload);

  // Direct user room — for push notification to specific receiver
  if (receiverId) {
    io.to(`user:${receiverId}`).emit('internal-message:new', payload);
  }

  return message;
}

export async function getDirectMessages(tenantId: string, userId1: string, userId2: string, page = 1, limit = 50) {
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
    prisma.internalMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.internalMessage.count({ where }),
  ]);
  return { messages: messages.reverse(), total };
}

export async function getGroupMessages(tenantId: string, groupId: string, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const where = { tenantId, groupId };
  const [messages, total] = await Promise.all([
    prisma.internalMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.internalMessage.count({ where }),
  ]);
  return { messages: messages.reverse(), total };
}

export async function markAsRead(messageId: string, tenantId: string, userId: string) {
  return prisma.internalMessage.updateMany({
    where: { id: messageId, tenantId, receiverId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getUnreadCount(userId: string, tenantId: string) {
  return prisma.internalMessage.count({
    where: { tenantId, receiverId: userId, readAt: null },
  });
}
