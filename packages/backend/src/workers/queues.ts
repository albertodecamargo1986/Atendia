import { Queue } from 'bullmq';
import redis from '../lib/redis.js';

export const aiResponseQueue = new Queue('ai-response', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 100 },
  },
});

/**
 * Envio pelo WhatsApp. Só 2 tentativas e o worker NÃO repete um envio que pode ter
 * saído (erro depois de chamar o WhatsApp) — mensagem duplicada é sinal de robô.
 */
export const whatsappOutboundQueue = new Queue('whatsapp-outbound', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

export const offhoursMessageQueue = new Queue('offhours-message', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 1000 },
    // jobId fixo por conversa (offhours-<id>): precisa sair da fila ao terminar para o próximo aviso
    removeOnComplete: true,
    removeOnFail: true,
  },
});

/** Transcrição de áudio recebido (fora do handler de mensagens do Baileys). */
export const audioTranscriptionQueue = new Queue('audio-transcription', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});

/** Campanhas: um "tick" por envio, encadeado pelo worker (ritmo controlado no worker). */
export const campaignQueue = new Queue('campaign', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 200 },
  },
});
