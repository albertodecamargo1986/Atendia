import { Server, Socket } from 'socket.io';
import { verifyAccessToken, type JwtPayload } from './jwt.js';
import prisma from './prisma.js';

let io: Server | null = null;

export function initSocket(ioInstance: Server) {
  io = ioInstance;

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      next(new Error('Token nao fornecido'));
      return;
    }
    try {
      const payload: JwtPayload = verifyAccessToken(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Token invalido'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user: JwtPayload = socket.data.user;

    socket.join(`tenant:${user.tenantId}`);
    socket.join(`user:${user.sub}`);

    // Conversation rooms — validate tenant ownership
    socket.on('conversation:join', async (conversationId: string) => {
      try {
        const conv = await prisma.conversation.findFirst({
          where: { id: conversationId, tenantId: user.tenantId },
          select: { id: true },
        });
        if (conv) {
          socket.join(`conversation:${conversationId}`);
        } else {
          socket.emit('error', { message: 'Conversation not found or access denied' });
        }
      } catch {
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // WhatsApp rooms — already scoped to tenant
    socket.on('whatsapp:subscribe', () => {
      socket.join(`whatsapp:${user.tenantId}`);
    });

    // Ticket rooms — validate tenant ownership
    socket.on('ticket:subscribe', async (ticketId: string) => {
      try {
        const ticket = await prisma.ticket.findFirst({
          where: { id: ticketId, tenantId: user.tenantId },
          select: { id: true },
        });
        if (ticket) {
          socket.join(`ticket:${ticketId}`);
        } else {
          socket.emit('error', { message: 'Ticket not found or access denied' });
        }
      } catch {
        socket.emit('error', { message: 'Failed to subscribe to ticket' });
      }
    });

    socket.on('ticket:unsubscribe', (ticketId: string) => {
      socket.leave(`ticket:${ticketId}`);
    });

    // Subscribe to a ticket status room (PENDING, OPEN, CLOSED) — tenant-scoped
    socket.on('ticket:subscribe-status', (status: string) => {
      if (['PENDING', 'OPEN', 'CLOSED'].includes(status)) {
        socket.join(`ticket-status:${user.tenantId}:${status}`);
      }
    });

    socket.on('ticket:unsubscribe-status', (status: string) => {
      socket.leave(`ticket-status:${user.tenantId}:${status}`);
    });

    socket.on('disconnect', () => {
      // client disconnected
    });
  });
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}
