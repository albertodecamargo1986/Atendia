import { Worker, Job } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { queueAutomatedMessage, resolveConversationRoute } from '../services/whatsapp.service.js';

interface OffHoursMessageJobData {
  tenantId: string;
  conversationId: string;
  agentName: string;
}

export function offHoursText(agentName: string): string {
  return `No momento estamos fora do horário de atendimento. O agente ${agentName} retornará sua mensagem durante o horário comercial.`;
}

/**
 * Aviso de fora do horário. A trava "no máx. 1x a cada 12 h por conversa" é feita ao
 * enfileirar (Redis offhours:<id> + jobId offhours-<id>). O status da conversa NÃO muda:
 * a IA volta a responder sozinha quando o horário abrir.
 */
export async function processOffHoursJob(job: Pick<Job<OffHoursMessageJobData>, 'data'>) {
  const { tenantId, conversationId, agentName } = job.data;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { id: true, channel: true, status: true },
  });
  if (!conversation || conversation.channel !== 'WHATSAPP') return { skipped: true };

  const route = await resolveConversationRoute(tenantId, conversationId);
  if (!route) return { skipped: true };

  const message = await queueAutomatedMessage({
    tenantId,
    conversationId,
    sessionId: route.sessionId,
    jid: route.jid,
    content: offHoursText(agentName),
    kind: 'offhours',
  });
  return message.id;
}

export function startOffHoursMessageWorker() {
  const worker = new Worker<OffHoursMessageJobData>('offhours-message', processOffHoursJob, {
    connection: redis as any,
    concurrency: 5,
  });

  worker.on('error', (err) => {
    console.error('OffHours Message Worker error:', err.message);
  });

  return worker;
}
