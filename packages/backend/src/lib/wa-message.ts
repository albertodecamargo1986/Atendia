/**
 * Leitura de mensagens recebidas do Baileys (texto, mídia, remetente, horário).
 */
import { normalizeMessageContent } from '@whiskeysockets/baileys';
import { isLidJid, phoneFromJid } from './whatsapp-jid.js';

export type IncomingMediaKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'STICKER';

/** Mensagens com mais de 10 min (ex.: recebidas offline) são gravadas mas não disparam IA/saudação/aviso. */
export const FRESH_MESSAGE_WINDOW_SEC = 600;

/** Conteúdo "real" da mensagem (desembrulha ephemeral, viewOnce, documentWithCaption, edição...). */
export function unwrapMessage(msg: any): any {
  try {
    return normalizeMessageContent(msg?.message) ?? null;
  } catch {
    return msg?.message ?? null;
  }
}

/** Texto da mensagem (ou rótulo da mídia). null = mensagem sem conteúdo útil (reação, protocolo...). */
export function extractMessageText(msg: any): string | null {
  const m = unwrapMessage(msg);
  if (!m) return null;

  const text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    // Respostas de botões / listas / templates
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.title ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    m.templateButtonReplyMessage?.selectedId ||
    interactiveResponseText(m.interactiveResponseMessage);

  if (text && String(text).trim()) return String(text);

  if (m.imageMessage) return '[Imagem]';
  if (m.videoMessage) return '[Vídeo]';
  if (m.audioMessage) return '[Áudio]';
  if (m.documentMessage) return `[Documento: ${m.documentMessage.fileName || 'arquivo'}]`;
  if (m.stickerMessage) return '[Figurinha]';
  if (m.contactMessage) return `[Contato: ${m.contactMessage.displayName || ''}]`;
  if (m.contactsArrayMessage) return '[Contatos]';
  if (m.locationMessage || m.liveLocationMessage) return '[Localização]';

  return null;
}

function interactiveResponseText(resp: any): string | undefined {
  if (!resp) return undefined;
  const body = resp.body?.text;
  if (body) return body;
  const params = resp.nativeFlowResponseMessage?.paramsJson;
  if (params) {
    try {
      const parsed = JSON.parse(params);
      return parsed?.id || parsed?.title || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Tipo de mídia da mensagem (já desembrulhada) + metadados úteis. */
export function getMediaInfo(msg: any): {
  kind: IncomingMediaKind;
  mimetype?: string;
  fileName?: string;
  fileLength?: number;
} | null {
  const m = unwrapMessage(msg);
  if (!m) return null;
  const pick = (kind: IncomingMediaKind, node: any) => ({
    kind,
    mimetype: node?.mimetype || undefined,
    fileName: node?.fileName || undefined,
    fileLength: node?.fileLength != null ? Number(node.fileLength) : undefined,
  });
  if (m.audioMessage) return pick('AUDIO', m.audioMessage);
  if (m.imageMessage) return pick('IMAGE', m.imageMessage);
  if (m.videoMessage) return pick('VIDEO', m.videoMessage);
  if (m.documentMessage) return pick('DOCUMENT', m.documentMessage);
  if (m.stickerMessage) return pick('STICKER', m.stickerMessage);
  return null;
}

/** Horário da mensagem em segundos (Baileys usa number | Long). */
export function messageTimestampSec(msg: any): number | null {
  const ts = msg?.messageTimestamp;
  if (ts == null) return null;
  const n = typeof ts === 'number' ? ts : Number(ts?.toString?.() ?? ts);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** true se a mensagem é recente (≤ 10 min). Sem horário conhecido, considera recente. */
export function isFreshMessage(msg: any, nowMs: number = Date.now(), windowSec = FRESH_MESSAGE_WINDOW_SEC): boolean {
  const ts = messageTimestampSec(msg);
  if (ts == null) return true;
  return nowMs / 1000 - ts < windowSec;
}

/**
 * Remetente de uma mensagem individual.
 * Com JID @lid (identidade oculta do WhatsApp), o telefone vem de `key.senderPn`.
 * @returns phone = só dígitos (null se desconhecido), lid = JID @lid (se houver), replyJid = para onde responder
 */
export function resolveSender(msg: any): { phone: string | null; lid: string | null; replyJid: string } {
  const remoteJid: string = msg?.key?.remoteJid || '';
  if (isLidJid(remoteJid)) {
    const pn = phoneFromJid(msg?.key?.senderPn || '');
    return { phone: pn, lid: remoteJid, replyJid: pn ? `${pn}@s.whatsapp.net` : remoteJid };
  }
  return { phone: phoneFromJid(remoteJid), lid: null, replyJid: remoteJid };
}
