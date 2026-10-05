import { Worker, Job, DelayedError } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import {
  sendHumanized,
  sendCloudSerialized,
  reserveAutomaticSend,
  MaybeSentError,
  SessionRestrictedError,
  type OutboundPayload,
} from '../services/whatsapp.service.js';
import { emitWebhookEvent } from '../services/webhook.service.js';
import { resolveUploadPath } from '../lib/uploads.js';
import { getIO } from '../lib/socket.js';
import { getSessionProvider } from '../lib/wa-provider.js';
import type { TemplateSend } from '../lib/wa-cloud-api.js';

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
  /** Só API oficial (Cloud API): modelo aprovado (fora da janela de 24 h) */
  template?: TemplateSend;
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
    // waMessageId também em coluna própria (indexada): o status de entrega acha a mensagem sem varrer metadata
    const waMessageId = typeof patch.waMessageId === 'string' && patch.waMessageId ? patch.waMessageId : undefined;
    await prisma.message.update({ where: { id: messageId }, data: { metadata: metadata as any, ...(waMessageId ? { waMessageId } : {}) } });
  } catch { /* mensagem removida */ }
}

/** API oficial: explica ao operador por que a mensagem não saiu (nota interna na conversa). */
async function addSystemNote(tenantId: string, conversationId: string, content: string) {
  try {
    const note = await prisma.message.create({ data: { conversationId, role: 'SYSTEM', content } });
    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('message:new', { conversationId, message: note });
    io.to(`conversation:${conversationId}`).emit('message:new', { conversationId, message: note });
  } catch { /* conversa removida / socket.io indisponível */ }
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
export async function processOutboundJob(
  job: Pick<Job<WhatsAppOutboundJobData>, 'data' | 'attemptsMade' | 'opts'> & Partial<Pick<Job<WhatsAppOutboundJobData>, 'moveToDelayed'>>,
  token?: string,
) {
  const data = job.data;
  const { sessionId, tenantId, conversationId, jid, messageId } = data;
  const type = data.audioPath ? 'audio' : data.media ? 'media' : 'text';

  try {
    // Teto de envios automáticos do número (10/min, 250/h): o excedente volta para a fila com atraso
    if (data.automatic) {
      const waitMs = await reserveAutomaticSend(sessionId, 'auto');
      if (waitMs > 0) {
        if (job.moveToDelayed && token) {
          await job.moveToDelayed(Date.now() + waitMs, token);
          throw new DelayedError();
        }
        return { success: false, delayedMs: waitMs, messageId };
      }
    }

    // Provedor do número: QR Code (Baileys, padrão) ou API oficial (Cloud API)
    const provider = await getSessionProvider(sessionId);
    const result = provider === 'CLOUD_API'
      ? await sendCloudSerialized(sessionId, jid, data.template ? { kind: 'template', ...data.template } : buildPayload(data), {
          idempotencyKey: messageId,
          automatic: !!data.automatic,
          conversationId,
        })
      : await sendHumanized(sessionId, jid, buildPayload(data), {
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
    if (err instanceof DelayedError) throw err;
    if (err instanceof SessionRestrictedError || err?.restricted === true) {
      // Número limitado: não envia nem tenta de novo
      await updateMessageStatus(messageId, { status: 'blocked', error: err.message, sessionId, jid });
      emitSent(tenantId, { sessionId, conversationId, messageId, status: 'failed', error: err.message });
      return { success: false, restricted: true, messageId };
    }
    if (err?.outsideWindow === true || err?.cloudApi === true) {
      // API oficial recusou (fora da janela de 24 h ou erro da Meta): a mensagem NÃO saiu e não é repetida
      const reason = err?.userMessage || err?.message;
      await updateMessageStatus(messageId, {
        status: err?.outsideWindow ? 'blocked' : 'failed', error: reason, sessionId, jid,
        ...(err?.code != null ? { errorCode: err.code } : {}),
      });
      emitSent(tenantId, { sessionId, conversationId, messageId, status: 'failed', error: reason });
      await addSystemNote(tenantId, conversationId, `Mensagem não enviada pela API oficial: ${reason}`);
      return { success: false, cloudRejected: true, messageId, error: reason };
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
