/**
 * Agendamento da resposta da IA (debounce) e montagem do contexto a partir do banco.
 *
 * Debounce: cada mensagem do cliente agenda um job com ~6 s de atraso. O job anterior
 * ainda pendente da mesma conversa é removido, e o worker só responde se a mensagem que
 * o disparou ainda for a ÚLTIMA do cliente — 3 mensagens rápidas = 1 resposta.
 */
import prisma from './prisma.js';
import redis from './redis.js';
import { aiResponseQueue } from '../workers/queues.js';

export const AI_DEBOUNCE_MS = 6_000;
export const AI_CONTEXT_MESSAGES = 20;

export interface AiJobData {
  tenantId: string;
  conversationId: string;
  agentId?: string;
  /** Mensagem do cliente que disparou o job (debounce/idempotência). */
  triggerMessageId?: string;
}

/**
 * Contexto da IA: as últimas 20 mensagens da conversa em ordem cronológica,
 * sem mensagens SYSTEM (notas internas, avisos, erros).
 */
export async function getConversationContext(conversationId: string, limit = AI_CONTEXT_MESSAGES) {
  const rows = await prisma.message.findMany({
    where: { conversationId, role: { not: 'SYSTEM' } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { role: true, content: true },
  });
  return rows.reverse().map((m) => ({ role: m.role.toLowerCase(), content: m.content }));
}

const lastJobKey = (conversationId: string) => `ai:job:${conversationId}`;

/** Agenda (ou reagenda) a resposta da IA para a conversa. */
export async function scheduleAiResponse(data: AiJobData, delayMs = AI_DEBOUNCE_MS) {
  const jobId = `ai-${data.conversationId}-${data.triggerMessageId || Date.now()}`;

  // Substitui o job anterior se ainda estiver só aguardando (best-effort: o worker também confere)
  try {
    const previousId = await redis.get(lastJobKey(data.conversationId));
    if (previousId && previousId !== jobId) {
      const previous = await aiResponseQueue.getJob(previousId);
      if (previous) {
        const state = await previous.getState();
        if (state === 'delayed' || state === 'waiting') await previous.remove();
      }
    }
  } catch { /* job já em execução/concluído: o worker descarta se não for o mais recente */ }

  await aiResponseQueue.add('generate', data, {
    jobId,
    delay: delayMs,
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  });
  try {
    await redis.set(lastJobKey(data.conversationId), jobId, 'EX', 3600);
  } catch { /* não crítico */ }
  return jobId;
}
