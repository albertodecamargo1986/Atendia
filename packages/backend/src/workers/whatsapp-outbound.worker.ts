import { Worker, Job } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { sendHumanized, MaybeSentError, SessionRestrictedError, type OutboundPayload } from '../services/whatsapp.service.js';
import { emitWebhookEvent } from '../services/webhook.service.js';
import { resolveUploadPath } from '../lib/uploads.js';
import { getIO } from '../lib/socket.js';

export interface WhatsAppOutboundJobData {
  /** sessionId do Baileys (nome da pasta de credenciais) */
  sessionId: string;
  tenantId: string;
  conversationId: string;
  jid: string;
  content: string;
  /** Message.id no banco (também é a chave de idempotência do envio) */
  messageId: string;
  /** Mensagem de voz gerada por TTS (.ogg = PTT; .mp3 = áudio comum) */
  audioPath?: string;
  /** Envio automático (IA, saudação, avisos): bloqueado se o número estiver limitado pelo WhatsApp */
  automatic?: boolean;
  /** Arquivo enviado pelo operador */
  media?: {
    mediaType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';
    url: string;
    mimetype?: string;
    fileName?: string;
    caption?: string;
  };
}

function buildPayload(data: WhatsAppOutboundJobData): OutboundPayload {
  if (data.audioPath) return { kind: 'audio', path: data.audioPath };
  if (data.media) {
    const filePath = resolveUploadPath(data.media.url);
    if (!filePath) throw new Error('Arquivo de mídia inválido');
    return {
      kind: 'media',
      mediaType: data.media.mediaType,
      path: filePath,
      mimetype: data.media.mimetype,
      fileName: data.media.fileName,
      caption: data.media.caption,
    };
  }
  return { kind: 'text', text: data.content };
}

/** Grava waMessageId/status em Message.metadata (sem apagar o que já existe). */
async function updateMessageStatus(messageId: string, patch: Record<string, unknown>) {
  try {
    const current = await prisma.message.findUnique({ where: { id: messageId }, select: { metadata: true } });
    if (!current) return;
    const metadata = { ...((current.metadata as Record<string, unknown>) || {}), ...patch };
    await prisma.message.update({ where: { id: messageId }, data: { metadata: metadata as any } });
  } catch { /* mensagem removida */ }
}

function emitSent(tenantId: string, payload: Record<string, unknown>) {
  try {
    getIO().to(`tenant:${tenantId}`).emit('whatsapp:message-sent', payload);
  } catch { /* socket.io indisponível */ }
}

/**
 * Processa um envio. Regras anti-banimento:
 *  - o envio passa pelo serializador por número (um por vez, "digitando...", 1,2 s mín.);
 *  - se o erro aconteceu DEPOIS de chamar o WhatsApp, NÃO repete (pode ter saído);
 *  - idempotência por messageId: o mesmo registro nunca é enviado duas vezes.
 */
export async function processOutboundJob(job: Pick<Job<WhatsAppOutboundJobData>, 'data' | 'attemptsMade' | 'opts'>) {
  const data = job.data;
  const { sessionId, tenantId, conversationId, jid, messageId } = data;
  const type = data.audioPath ? 'audio' : data.media ? 'media' : 'text';

  try {
    const result = await sendHumanized(sessionId, jid, buildPayload(data), {
      idempotencyKey: messageId,
      automatic: !!data.automatic,
    });
    if (result.skipped) {
      return { success: true, skipped: true, messageId };
    }
    await updateMessageStatus(messageId, { waMessageId: result.id, sessionId, jid, status: 'sent', sentAt: new Date().toISOString() });
    emitSent(tenantId, { sessionId, conversationId, messageId, status: 'sent', type, sentId: result.id });
    emitWebhookEvent(tenantId, 'message.sent', {
      conversationId, messageId, waMessageId: result.id, type, content: data.content,
    });
    return { success: true, messageId, sentId: result.id, type };
  } catch (err: any) {
    if (err instanceof SessionRestrictedError || err?.restricted === true) {
      // Número limitado: não envia nem tenta de novo
      await updateMessageStatus(messageId, { status: 'blocked', error: err.message, sessionId, jid });
      emitSent(tenantId, { sessionId, conversationId, messageId, status: 'failed', error: err.message });
      return { success: false, restricted: true, messageId };
    }
    const maybeSent = err instanceof MaybeSentError || err?.maybeSent === true;
    const lastAttempt = maybeSent || job.attemptsMade + 1 >= (job.opts?.attempts ?? 1);
    if (lastAttempt) {
      await updateMessageStatus(messageId, {
        status: maybeSent ? 'unknown' : 'failed',
        error: err?.message,
        sessionId,
        jid,
      });
      emitSent(tenantId, { sessionId, conversationId, messageId, status: 'failed', error: err?.message });
    }
    // Pode ter saído: encerra sem nova tentativa (mensagem duplicada é pior que perdida)
    if (maybeSent) return { success: false, maybeSent: true, messageId, error: err?.message };
    throw err;
  }
}

export function startWhatsAppOutboundWorker() {
  const worker = new Worker<WhatsAppOutboundJobData>('whatsapp-outbound', processOutboundJob, {
    connection: redis as any,
    // Vários números em paralelo; dentro do mesmo número o serializador garante 1 por vez
    concurrency: 10,
    // Envios esperam na fila do número ("digitando..."): trava longa evita job "travado"
    lockDuration: 120_000,
  });

  worker.on('failed', (job, err) => {
    if (!job) return;
    console.error(`WhatsApp outbound failed for session ${job.data.sessionId}:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('WhatsApp Outbound Worker error:', err.message);
  });

  return worker;
}
