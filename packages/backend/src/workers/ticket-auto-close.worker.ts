import { Worker, Queue } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { getIO } from '../lib/socket.js';
import { subHours } from 'date-fns';

export function startTicketAutoCloseWorker() {
  const ticketCheckQueue = new Queue('ticket-auto-check', { connection: redis as any });

  // Schedule check every 10 minutes
  ticketCheckQueue.add('check', {}, {
    repeat: { every: 600000 },
  });

  const worker = new Worker(
    'ticket-auto-check',
    async () => {
      const now = new Date();

      // Find tickets PENDING for more than 24h — notify supervisors
      const stalePending = await prisma.ticket.findMany({
        where: {
          status: 'PENDING',
          createdAt: { lte: subHours(now, 24) },
        },
        include: {
          tenant: { select: { id: true } },
          contact: { select: { name: true, phone: true } },
          queue: { select: { name: true } },
        },
        take: 100,
      });

      for (const ticket of stalePending) {
        const io = getIO();
        io.to(`tenant:${ticket.tenantId}`).emit('ticket:stale', {
          ticketId: ticket.id,
          contactName: ticket.contact.name,
          queueName: ticket.queue?.name || 'Sem fila',
          hoursWaiting: Math.floor((now.getTime() - ticket.createdAt.getTime()) / 3600000),
        });
      }
    },
    { connection: redis as any }
  );

  worker.on('error', (err) => {
    console.error('Ticket auto-check worker error:', err.message);
  });

  return worker;
}
