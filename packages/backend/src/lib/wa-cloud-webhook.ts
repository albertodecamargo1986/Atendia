/**
 * Webhook da API oficial (Cloud API): verificação da Meta, assinatura X-Hub-Signature-256 e
 * normalização das mensagens recebidas para o MESMO formato interno usado pelo QR Code (Baileys)
 * — assim elas passam pela mesma função de entrada (dedupe, opt-out, anti-loop, saudação,
 * fora do horário, tickets, IA com debounce).
 */
import crypto from 'crypto';

/** Compara em tempo constante (tamanhos diferentes = falso, sem lançar). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** GET de verificação: devolve o challenge se o verify token confere; senão null (→ 403). */
export function verifyWebhookChallenge(query: Record<string, unknown>, verifyToken: string | null | undefined): string | null {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode !== 'subscribe' || typeof token !== 'string' || typeof challenge !== 'string') return null;
  if (!verifyToken || !safeEqual(token, verifyToken)) return null;
  return challenge;
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(corpo bruto, App Secret). */
export function computeSignature(rawBody: Buffer | string, appSecret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
}

export function isValidSignature(rawBody: Buffer | string | undefined | null, header: unknown, appSecret: string | null | undefined): boolean {
  if (!rawBody || !appSecret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(computeSignature(rawBody, appSecret), 'utf8');
  const received = Buffer.from(header.trim(), 'utf8');
  // timingSafeEqual exige o mesmo tamanho: tamanho diferente já é inválido
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

// ─── Normalização ───────────────────────────────────────────────────────────

export interface CloudMediaRef {
  id: string;
  mimeType?: string;
  fileName?: string;
}

/** Mensagem no formato interno (o mesmo "msg" do Baileys que a entrada compartilhada entende). */
export interface NormalizedIncoming {
  key: { remoteJid: string; fromMe: false; id: string };
  message: Record<string, any>;
  pushName?: string;
  messageTimestamp?: number;
  /** Só Cloud API: mídia a baixar pela Graph API. */
  cloudMedia?: CloudMediaRef;
  /** Só Cloud API: tipo original (diagnóstico). */
  cloudType?: string;
}

/**
 * Converte uma mensagem do webhook em formato interno. null = ignorar (reação, sistema,
 * tipo desconhecido, sem remetente).
 */
export function normalizeCloudMessage(m: any, contacts: any[] = []): NormalizedIncoming | null {
  const from = String(m?.from || '').replace(/\D/g, '');
  const id = typeof m?.id === 'string' ? m.id : '';
  if (!from || !id) return null;
  const contact = contacts.find((c) => String(c?.wa_id || '') === from) ?? contacts[0];
  const ts = Number(m?.timestamp);
  const base = {
    key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false as const, id },
    pushName: contact?.profile?.name || undefined,
    messageTimestamp: Number.isFinite(ts) && ts > 0 ? ts : undefined,
    cloudType: m?.type,
  };
  const media = (node: any, extra: Record<string, unknown> = {}) => ({
    mimetype: node?.mime_type || undefined,
    ...(node?.caption ? { caption: node.caption } : {}),
    ...(node?.filename ? { fileName: node.filename } : {}),
    ...extra,
  });
  const ref = (node: any): CloudMediaRef | undefined =>
    node?.id ? { id: String(node.id), mimeType: node.mime_type || undefined, fileName: node.filename || undefined } : undefined;

  switch (m?.type) {
    case 'text':
      if (!m.text?.body) return null;
      return { ...base, message: { conversation: String(m.text.body) } };
    case 'image':
      return { ...base, message: { imageMessage: media(m.image) }, cloudMedia: ref(m.image) };
    case 'video':
      return { ...base, message: { videoMessage: media(m.video) }, cloudMedia: ref(m.video) };
    case 'audio':
      return { ...base, message: { audioMessage: media(m.audio, { ptt: !!m.audio?.voice }) }, cloudMedia: ref(m.audio) };
    case 'document':
      return { ...base, message: { documentMessage: media(m.document) }, cloudMedia: ref(m.document) };
    case 'sticker':
      return { ...base, message: { stickerMessage: media(m.sticker) } };
    case 'interactive': {
      const it = m.interactive || {};
      if (it.type === 'button_reply' && it.button_reply) {
        return {
          ...base,
          message: { buttonsResponseMessage: { selectedDisplayText: it.button_reply.title, selectedButtonId: it.button_reply.id } },
        };
      }
      if (it.type === 'list_reply' && it.list_reply) {
        return {
          ...base,
          message: { listResponseMessage: { title: it.list_reply.title, singleSelectReply: { selectedRowId: it.list_reply.id } } },
        };
      }
      return null;
    }
    case 'button':
      // Resposta rápida de um modelo (botão de resposta)
      if (!m.button?.text && !m.button?.payload) return null;
      return {
        ...base,
        message: { templateButtonReplyMessage: { selectedDisplayText: m.button.text, selectedId: m.button.payload } },
      };
    case 'location':
      return {
        ...base,
        message: { locationMessage: { degreesLatitude: m.location?.latitude, degreesLongitude: m.location?.longitude, name: m.location?.name } },
      };
    case 'contacts': {
      const list: any[] = Array.isArray(m.contacts) ? m.contacts : [];
      if (list.length === 1) return { ...base, message: { contactMessage: { displayName: list[0]?.name?.formatted_name || '' } } };
      return { ...base, message: { contactsArrayMessage: { contacts: list.length } } };
    }
    // Reação, sistema, pedidos, tipos não suportados: ignorados (não viram mensagem nem acionam a IA)
    default:
      return null;
  }
}

export interface CloudStatusEvent {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | string;
  recipientId?: string;
  timestamp?: number;
  errors: Array<{ code: number | null; title?: string; message?: string; details?: string }>;
}

export function normalizeCloudStatus(s: any): CloudStatusEvent | null {
  if (!s?.id || !s?.status) return null;
  const errors = (Array.isArray(s.errors) ? s.errors : []).map((e: any) => ({
    code: e?.code != null && Number.isFinite(Number(e.code)) ? Number(e.code) : null,
    title: e?.title,
    message: e?.message,
    details: e?.error_data?.details,
  }));
  const ts = Number(s.timestamp);
  return {
    id: String(s.id),
    status: String(s.status),
    recipientId: s.recipient_id ? String(s.recipient_id) : undefined,
    timestamp: Number.isFinite(ts) ? ts : undefined,
    errors,
  };
}

export interface CloudChange {
  phoneNumberId: string | null;
  messages: any[];
  contacts: any[];
  statuses: any[];
}

/** Extrai as mudanças do campo "messages" de um POST do webhook. */
export function extractCloudChanges(body: any): CloudChange[] {
  if (body?.object !== 'whatsapp_business_account') return [];
  const out: CloudChange[] = [];
  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'messages') continue;
      const v = change.value || {};
      out.push({
        phoneNumberId: v.metadata?.phone_number_id ? String(v.metadata.phone_number_id) : null,
        messages: Array.isArray(v.messages) ? v.messages : [],
        contacts: Array.isArray(v.contacts) ? v.contacts : [],
        statuses: Array.isArray(v.statuses) ? v.statuses : [],
      });
    }
  }
  return out;
}
