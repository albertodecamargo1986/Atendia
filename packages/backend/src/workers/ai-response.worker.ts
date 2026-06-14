import { Worker, Job } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generateResponse } from '../services/ai.service.js';
import { sendWhatsAppMessage, sendWhatsAppAudio } from '../services/whatsapp.service.js';
import { whatsappOutboundQueue } from './queues.js';
import { getIO } from '../lib/socket.js';
import { generateAudioResponse } from '../services/voice.service.js';

interface AIResponseJobData {
  agentId: string;
  tenantId: string;
  conversationId: string;
  messages: { role: string; content: string }[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startAIResponseWorker() {
  const worker = new Worker<AIResponseJobData>(
    'ai-response',
    async (job: Job<AIResponseJobData>) => {
      const { agentId, tenantId, conversationId, messages } = job.data;

      // Fetch agent config for delay + audio settings
      const agent = await prisma.agent.findFirst({
        where: { id: agentId, tenantId },
        include: { voiceProfile: true },
      });

      if (!agent) throw new Error('Agente não encontrado');
      if (!agent.isActive) throw new Error('Agente inativo');

      const io = getIO();

      // Emit typing indicator
      io.to(`conversation:${conversationId}`).emit('agent:typing', { conversationId });
      io.to(`tenant:${tenantId}`).emit('agent:typing', { conversationId });

      // Humanized delay
      const delayMin = agent.responseDelayMinMs || 1000;
      const delayMax = agent.responseDelayMaxMs || 4000;
      const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
      await sleep(delay);

      // Generate AI response
      const aiContent = await generateResponse(agentId, tenantId, messages);

      // Stop typing indicator
      io.to(`conversation:${conversationId}`).emit('agent:stopped-typing', { conversationId });
      io.to(`tenant:${tenantId}`).emit('agent:stopped-typing', { conversationId });

      // Create message in DB
      const aiMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: aiContent,
        },
      });

      io.to(`tenant:${tenantId}`).emit('message:new', { conversationId, message: aiMessage });
      io.to(`conversation:${conversationId}`).emit('message:new', { conversationId, message: aiMessage });

      // Send AI response back via WhatsApp if the conversation is on that channel
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
          // Check if we should send audio instead of (or alongside) text
          const shouldSendAudio = agent.sendAudioFrequency > 0;
          let sendAudioThisTurn = false;

          if (shouldSendAudio) {
            const assistantCount = await prisma.message.count({
              where: {
                conversationId,
                role: 'ASSISTANT',
              },
            });
            sendAudioThisTurn = assistantCount % agent.sendAudioFrequency === 0;
          }

          if (sendAudioThisTurn && agent.voiceProfile) {
            try {
              const audioPath = await generateAudioResponse(
                aiContent,
                agent.voiceProfile.voiceId,
                tenantId,
                agent.voiceProfile.provider as 'elevenlabs' | 'openai'
              );

              await whatsappOutboundQueue.add('send-audio', {
                sessionId,
                tenantId,
                conversationId,
                jid,
                content: aiContent,
                audioPath,
                messageId: aiMessage.id,
              });
            } catch (err: any) {
              console.error('Audio generation failed, falling back to text:', err.message);
              await whatsappOutboundQueue.add('send', {
                sessionId,
                tenantId,
                conversationId,
                jid,
                content: aiContent,
                messageId: aiMessage.id,
              });
            }
          } else if (sendAudioThisTurn && !agent.voiceProfile) {
            // No voice profile configured but frequency > 0 — use OpenAI TTS as fallback
            try {
              const audioPath = await generateAudioResponse(aiContent, 'nova', tenantId, 'openai');

              await whatsappOutboundQueue.add('send-audio', {
                sessionId,
                tenantId,
                conversationId,
                jid,
                content: aiContent,
                audioPath,
                messageId: aiMessage.id,
              });
            } catch (err: any) {
              console.error('OpenAI TTS fallback failed, sending text:', err.message);
              await whatsappOutboundQueue.add('send', {
                sessionId,
                tenantId,
                conversationId,
                jid,
                content: aiContent,
                messageId: aiMessage.id,
              });
            }
          } else {
            // Send text only
            await whatsappOutboundQueue.add('send', {
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
    },
    {
      connection: redis as any,
      concurrency: 5,
    }
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const { tenantId, conversationId } = job.data;

    const io = getIO();
    io.to(`conversation:${conversationId}`).emit('agent:stopped-typing', { conversationId });

    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      const errorMessage = await prisma.message.create({
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
