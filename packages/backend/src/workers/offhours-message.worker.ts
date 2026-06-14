import { Worker, Job } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { whatsappOutboundQueue } from './queues.js';
import { getIO } from '../lib/socket.js';

interface OffHoursMessageJobData {
  tenantId: string;
  conversationId: string;
  agentName: string;
}

export function startOffHoursMessageWorker() {
  const worker = new Worker<OffHoursMessageJobData>(
    'offhours-message',
    async (job: Job<OffHoursMessageJobData>) => {
      const { tenantId, conversationId, agentName } = job.data;

      const offHoursText = `No momento estamos fora do horário de atendimento. O agente ${agentName} retornará sua mensagem durante o horário comercial.`;

      const systemMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'SYSTEM',
          content: offHoursText,
        },
      });

      const io = getIO();
      io.to(`tenant:${tenantId}`).emit('message:new', { conversationId, message: systemMessage });
      io.to(`conversation:${conversationId}`).emit('message:new', { conversationId, message: systemMessage });

      // Send off-hours message via WhatsApp too
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
      messages: {
        where: { role: 'USER' },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
    },
      });

      if (conversation?.channel === 'WHATSAPP' && conversation.contactPhone) {
        const lastUserMsg = conversation.messages[0];
        const metadata = lastUserMsg?.metadata as any;
        const jid = metadata?.jid || `${conversation.contactPhone}@s.whats.net`;
        const sessionId = metadata?.sessionId;

        if (sessionId) {
          await whatsappOutboundQueue.add('send', {
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
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'PENDING' },
      });

      io.to(`tenant:${tenantId}`).emit('conversation:updated', {
        conversation: { id: conversationId, status: 'PENDING' },
      });

      return systemMessage.id;
    },
    {
      connection: redis as any,
      concurrency: 5,
    }
  );

  worker.on('error', (err) => {
    console.error('OffHours Message Worker error:', err.message);
  });

  return worker;
}
