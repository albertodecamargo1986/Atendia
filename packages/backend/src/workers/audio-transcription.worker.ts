import { Worker, Job } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { transcribeAudio } from '../services/voice.service.js';
import { scheduleAiResponse } from '../lib/ai-schedule.js';
import { getIO } from '../lib/socket.js';

export interface AudioTranscriptionJobData {
  tenantId: string;
  conversationId: string;
  messageId: string;
  filePath: string;
  /** Agendar a resposta da IA depois de transcrever (a decisão foi tomada ao receber). */
  scheduleAi: boolean;
}

/** Transcreve o áudio recebido, atualiza a mensagem e (se for o caso) agenda a IA. */
export async function processAudioTranscriptionJob(job: Pick<Job<AudioTranscriptionJobData>, 'data'>) {
  const { tenantId, conversationId, messageId, filePath, scheduleAi } = job.data;

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
    select: { id: true, metadata: true },
  });
  if (!message) return { skipped: 'not_found' };

  let transcription = '';
  try {
    transcription = (await transcribeAudio(filePath, tenantId)).trim();
  } catch (err: any) {
    console.error('Audio transcription failed:', err.message);
  }

  const metadata = { ...((message.metadata as Record<string, unknown>) || {}), audioTranscribed: !!transcription, audioPending: false };
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content: transcription ? `[Áudio] ${transcription}` : '[Áudio]', metadata: metadata as any },
  });

  try {
    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('message:updated', { conversationId, message: updated });
    io.to(`conversation:${conversationId}`).emit('message:updated', { conversationId, message: updated });
  } catch { /* socket.io indisponível */ }

  if (scheduleAi) {
    // Gatilho = a ÚLTIMA mensagem do cliente agora (se ele mandou texto depois do áudio, a
    // resposta sai uma vez só, já com o áudio transcrito no contexto)
    const latest = await prisma.message.findFirst({
      where: { conversationId, role: 'USER' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    await scheduleAiResponse({ tenantId, conversationId, triggerMessageId: latest?.id ?? messageId }, 1_500);
  }
  return { transcribed: !!transcription };
}

let started = false;

export function startAudioTranscriptionWorker() {
  if (started) return null;
  started = true;
  const worker = new Worker<AudioTranscriptionJobData>('audio-transcription', processAudioTranscriptionJob, {
    connection: redis as any,
    concurrency: 2,
  });
  worker.on('error', (err) => {
    console.error('Audio Transcription Worker error:', err.message);
  });
  return worker;
}
