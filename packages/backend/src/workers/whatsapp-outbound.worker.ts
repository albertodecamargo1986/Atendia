import { Worker, Job } from 'bullmq';
import redis from '../lib/redis.js';
import { sendWhatsAppMessage, sendWhatsAppAudio } from '../services/whatsapp.service.js';
import { getIO } from '../lib/socket.js';

interface WhatsAppOutboundJobData {
  sessionId: string;
  tenantId: string;
  conversationId: string;
  jid: string;
  content: string;
  messageId: string;
  audioPath?: string;
}

export function startWhatsAppOutboundWorker() {
  const worker = new Worker<WhatsAppOutboundJobData>(
    'whatsapp-outbound',
    async (job: Job<WhatsAppOutboundJobData>) => {
      const { sessionId, tenantId, conversationId, jid, content, messageId, audioPath } = job.data;

      try {
        // If audioPath is provided, send as voice message
        if (audioPath) {
          const sent = await sendWhatsAppAudio(sessionId, jid, audioPath);
          const io = getIO();
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
        const sent = await sendWhatsAppMessage(sessionId, jid, content);

        const io = getIO();
        io.to(`tenant:${tenantId}`).emit('whatsapp:message-sent', {
          sessionId,
          conversationId,
          messageId,
          status: 'sent',
          sentId: sent?.key?.id,
        });

        return { success: true, messageId, sentId: sent?.key?.id };
      } catch (err: any) {
        const io = getIO();
        io.to(`tenant:${tenantId}`).emit('whatsapp:message-sent', {
          sessionId,
          conversationId,
          messageId,
          status: 'failed',
          error: err.message,
        });

        throw err;
      }
    },
    {
      connection: redis as any,
      concurrency: 10,
    }
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    console.error(`WhatsApp outbound failed for session ${job.data.sessionId}:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('WhatsApp Outbound Worker error:', err.message);
  });

  return worker;
}
