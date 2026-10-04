import { Worker, Job } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { generateResponse } from '../services/ai.service.js';
import { resolveConversationRoute } from '../services/whatsapp.service.js';
import { isWithinBusinessHours } from '../services/business-hours.service.js';
import { whatsappOutboundQueue } from './queues.js';
import { getIO } from '../lib/socket.js';
import { generateAudioResponse, MAX_TTS_CHARS } from '../services/voice.service.js';
import { getConversationContext, type AiJobData } from '../lib/ai-schedule.js';
import { claimOnce, countAiReply, getRestrictedUntil, AI_LOOP_PAUSE_TEXT, DAY_SEC } from '../lib/wa-guards.js';
import { sleep } from '../lib/wa-pacing.js';
import { startAudioTranscriptionWorker } from './audio-transcription.worker.js';
import { startMaintenanceWorker } from './maintenance.worker.js';

/** Job antigo (antes do debounce) ainda pode trazer `messages` — é ignorado: o contexto vem do banco. */
type AIResponseJobData = AiJobData & { messages?: unknown };

function emit(rooms: string[], event: string, payload: unknown) {
  try {
    const io = getIO();
    for (const room of rooms) io.to(room).emit(event, payload);
  } catch { /* socket.io indisponível */ }
}

async function latestUserMessage(conversationId: string) {
  return prisma.message.findFirst({
    where: { conversationId, role: 'USER' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
}

/** A conversa ainda deve ser respondida pela IA agora? (status ACTIVE + agente ativo + horário) */
async function stillEligible(tenantId: string, conversationId: string) {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { status: true, agent: { select: { isActive: true } } },
  });
  if (!conv || conv.status !== 'ACTIVE' || !conv.agent?.isActive) return false;
  return isWithinBusinessHours(tenantId);
}

/**
 * Gera e enfileira a resposta da IA. Pula (sem erro) quando:
 *  - a conversa não está mais com a IA (ACTIVE) ou está fora do horário;
 *  - chegou mensagem mais nova do cliente (debounce: o job dela responde tudo);
 *  - essa mensagem já foi respondida (idempotência);
 *  - passou do limite anti-loop (8 em 10 min / 30 em 1 h) → pausa a IA.
 */
export async function processAiResponseJob(job: Pick<Job<AIResponseJobData>, 'data'>) {
  const { tenantId, conversationId, triggerMessageId } = job.data;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    include: { agent: { include: { voiceProfile: true } } },
  });
  if (!conversation) return { skipped: 'not_found' };
  if (conversation.status !== 'ACTIVE') return { skipped: 'status' };
  const agent = conversation.agent;
  if (!agent || !agent.isActive) return { skipped: 'agent_inactive' };

  const latest = await latestUserMessage(conversationId);
  if (!latest) return { skipped: 'no_user_message' };
  if (triggerMessageId && latest.id !== triggerMessageId) return { skipped: 'superseded' };

  // Idempotência: esta mensagem do cliente já foi respondida?
  if (await redis.get(`ai:answered:${latest.id}`)) return { skipped: 'already_answered' };

  if (!(await isWithinBusinessHours(tenantId))) return { skipped: 'off_hours' };

  // Número limitado pelo WhatsApp (463/475): IA pausada por 24 h (não gasta a IA nem envia)
  const route = conversation.channel === 'WHATSAPP' ? await resolveConversationRoute(tenantId, conversationId) : null;
  if (route && (await getRestrictedUntil(route.sessionId))) return { skipped: 'restricted' };

  // Anti-loop robô ↔ robô
  const rate = await countAiReply(conversationId);
  if (!rate.allowed) {
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'HUMAN_TAKEOVER' },
    });
    const note = await prisma.message.create({
      data: { conversationId, role: 'SYSTEM', content: AI_LOOP_PAUSE_TEXT },
    });
    emit([`tenant:${tenantId}`], 'conversation:updated', { conversation: updated });
    emit([`tenant:${tenantId}`, `conversation:${conversationId}`], 'message:new', { conversationId, message: note });
    return { skipped: 'ai_loop_paused' };
  }

  const typingRooms = [`conversation:${conversationId}`, `tenant:${tenantId}`];
  emit(typingRooms, 'agent:typing', { conversationId });

  // Atraso configurado no agente (o "digitando..." real acontece no envio)
  const delayMin = agent.responseDelayMinMs || 1000;
  const delayMax = Math.max(agent.responseDelayMaxMs || 4000, delayMin);
  await sleep(Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin);

  let aiContent: string;
  try {
    const context = await getConversationContext(conversationId);
    aiContent = await generateResponse(agent.id, tenantId, context);
  } finally {
    emit(typingRooms, 'agent:stopped-typing', { conversationId });
  }

  // Rechecagem antes de enviar: mensagem nova chegou? humano assumiu? fechou o horário?
  const latestAfter = await latestUserMessage(conversationId);
  if (latestAfter && latestAfter.id !== latest.id) return { skipped: 'superseded' };
  if (!(await stillEligible(tenantId, conversationId))) return { skipped: 'status_changed' };
  if (!(await claimOnce(`ai:answered:${latest.id}`, DAY_SEC))) return { skipped: 'already_answered' };

  const aiMessage = await prisma.message.create({
    data: { conversationId, role: 'ASSISTANT', content: aiContent },
  });
  emit([`tenant:${tenantId}`, `conversation:${conversationId}`], 'message:new', { conversationId, message: aiMessage });

  if (conversation.channel !== 'WHATSAPP' || !route) return aiMessage.id;

  const base = {
    sessionId: route.sessionId,
    tenantId,
    conversationId,
    jid: route.jid,
    content: aiContent,
    messageId: aiMessage.id,
    automatic: true,
  };
  const jobOpts = { jobId: `out-${aiMessage.id}` };

  // Voz: a cada N respostas (sendAudioFrequency), só para textos curtos (≤ 600 caracteres)
  let sendAudio = false;
  if (agent.sendAudioFrequency > 0 && aiContent.length <= MAX_TTS_CHARS) {
    const assistantCount = await prisma.message.count({ where: { conversationId, role: 'ASSISTANT' } });
    sendAudio = assistantCount % agent.sendAudioFrequency === 0;
  }

  if (sendAudio) {
    try {
      const audioPath = agent.voiceProfile
        ? await generateAudioResponse(
            aiContent,
            agent.voiceProfile.voiceId,
            tenantId,
            agent.voiceProfile.provider as 'elevenlabs' | 'openai',
            'opus',
          )
        : await generateAudioResponse(aiContent, 'nova', tenantId, 'openai', 'opus');
      await whatsappOutboundQueue.add('send-audio', { ...base, audioPath }, jobOpts);
      return aiMessage.id;
    } catch (err: any) {
      console.error('Audio generation failed, falling back to text:', err.message);
    }
  }

  await whatsappOutboundQueue.add('send', base, jobOpts);
  return aiMessage.id;
}

export function startAIResponseWorker() {
  const worker = new Worker<AIResponseJobData>('ai-response', processAiResponseJob, {
    connection: redis as any,
    concurrency: 5,
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const { conversationId } = job.data;

    emit([`conversation:${conversationId}`], 'agent:stopped-typing', { conversationId });

    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      try {
        const errorMessage = await prisma.message.create({
          data: {
            conversationId,
            role: 'SYSTEM',
            content: `Erro ao gerar resposta da IA após ${job.attemptsMade} tentativas: ${err.message}`,
          },
        });
        emit([`conversation:${conversationId}`], 'message:new', { conversationId, message: errorMessage });
      } catch { /* conversa removida */ }
    }
  });

  worker.on('error', (err) => {
    console.error('AI Response Worker error:', err.message);
  });

  // Workers auxiliares do atendimento (iniciados junto com a IA)
  startAudioTranscriptionWorker();
  startMaintenanceWorker();

  return worker;
}
