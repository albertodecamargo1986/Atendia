/**
 * Travas no Redis que protegem o número e o fluxo:
 *  - dedupe de mensagem recebida (mesmo id do WhatsApp só é processado 1x em 24 h);
 *  - "no máx. 1x por janela" (saudação, aviso de fora do horário);
 *  - anti-loop robô↔robô (limite de respostas da IA por conversa);
 *  - mensagem idêntica repetida (não responder spam/robô);
 *  - registro das mensagens enviadas pelo sistema (getMessage do Baileys + separar do que veio do celular).
 * Usa a conexão Redis já existente (lib/redis.ts).
 */
import crypto from 'crypto';
import redis from './redis.js';

/** Subconjunto do ioredis usado aqui (permite um fake em memória nos testes). */
export interface RedisLike {
  set(key: string, value: string, ...args: any[]): Promise<any>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

const client = (): RedisLike => redis as unknown as RedisLike;

export const DAY_SEC = 86_400;
export const TWELVE_HOURS_SEC = 12 * 3600;

/** SET NX com expiração: true só para quem pegou a trava agora. */
export async function claimOnce(key: string, ttlSec: number, r: RedisLike = client()): Promise<boolean> {
  const res = await r.set(key, '1', 'EX', ttlSec, 'NX');
  return res === 'OK';
}

/** Mensagem recebida já processada? (dedupe por msg.key.id, 24 h) */
export async function isDuplicateIncoming(sessionId: string, messageId: string | null | undefined, r: RedisLike = client()) {
  if (!messageId) return false;
  const claimed = await claimOnce(`wa:in:${sessionId}:${messageId}`, DAY_SEC, r);
  return !claimed;
}

// ─── Anti-loop robô ↔ robô ──────────────────────────────────────────────────

export const AI_LIMIT_10_MIN = 8;
export const AI_LIMIT_1_HOUR = 30;
export const AI_LOOP_PAUSE_TEXT = 'Pausamos a IA: possível conversa com robô';

async function incrWithTtl(key: string, ttlSec: number, r: RedisLike): Promise<number> {
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, ttlSec);
  return n;
}

/**
 * Conta mais uma resposta da IA na conversa.
 * @returns allowed=false quando passaria de 8 em 10 min ou 30 em 1 h (aí a IA deve pausar)
 */
export async function countAiReply(conversationId: string, r: RedisLike = client()) {
  const in10m = await incrWithTtl(`ai:rate:10m:${conversationId}`, 600, r);
  const in1h = await incrWithTtl(`ai:rate:1h:${conversationId}`, 3600, r);
  const allowed = in10m <= AI_LIMIT_10_MIN && in1h <= AI_LIMIT_1_HOUR;
  return { allowed, in10m, in1h };
}

/** Zera os contadores (ex.: quando um humano devolve a conversa para a IA). */
export async function resetAiReplyCounters(conversationId: string, r: RedisLike = client()) {
  await r.del(`ai:rate:10m:${conversationId}`, `ai:rate:1h:${conversationId}`);
}

// ─── Mensagem idêntica repetida ─────────────────────────────────────────────

export const MAX_IDENTICAL_REPEATS = 3;

function hashText(text: string): string {
  return crypto.createHash('sha1').update(text.trim().toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Registra a mensagem do cliente e diz quantas vezes seguidas ela se repetiu (1 = primeira).
 * A IA ignora a partir da 4ª repetição idêntica seguida.
 */
export async function trackRepeatedMessage(conversationId: string, text: string, r: RedisLike = client()): Promise<number> {
  const key = `ai:repeat:${conversationId}`;
  const h = hashText(text || '');
  let count = 1;
  const raw = await r.get(key);
  if (raw) {
    try {
      const prev = JSON.parse(raw) as { h: string; n: number };
      if (prev.h === h) count = (prev.n || 1) + 1;
    } catch { /* valor inválido: recomeça */ }
  }
  await r.set(key, JSON.stringify({ h, n: count }), 'EX', 3600);
  return count;
}

export function shouldIgnoreRepeated(count: number): boolean {
  return count > MAX_IDENTICAL_REPEATS;
}

// ─── Mensagens enviadas pelo sistema ────────────────────────────────────────

const sentKey = (sessionId: string, messageId: string) => `wa:sent:${sessionId}:${messageId}`;

/** Guarda a mensagem enviada (24 h): getMessage do Baileys (reenvio) e separação do "enviado pelo celular". */
export async function rememberSentMessage(sessionId: string, messageId: string, serialized: string, r: RedisLike = client()) {
  await r.set(sentKey(sessionId, messageId), serialized, 'EX', DAY_SEC);
}

export async function getSentMessage(sessionId: string, messageId: string, r: RedisLike = client()) {
  return r.get(sentKey(sessionId, messageId));
}

// ─── Restrição temporária do número (463 / 475 / erros de envio seguidos) ───

/** Códigos de erro de ack que indicam limitação do número pelo WhatsApp. */
export const RESTRICTION_ACK_CODES = ['463', '475'];
export const RESTRICTION_PAUSE_MS = 24 * 3600_000;
/** Erros de envio (ack ERROR) seguidos em 10 min que também disparam a pausa. */
export const SEND_ERROR_LIMIT = 3;

/**
 * Decide se um ack de erro deve pausar as automações do número.
 * 463 (reachout timelock) / 475 (limite) → pausa imediata; outros erros → a partir do 3º em 10 min.
 */
export function shouldRestrictOnAckError(code: string | number | null | undefined, recentErrors: number): boolean {
  if (code != null && RESTRICTION_ACK_CODES.includes(String(code))) return true;
  return recentErrors >= SEND_ERROR_LIMIT;
}

/** Conta um erro de envio do número (janela de 10 min). */
export async function countSendError(sessionId: string, r: RedisLike = client()): Promise<number> {
  return incrWithTtl(`wa:senderr:${sessionId}`, 600, r);
}

const restrictedKey = (sessionId: string) => `wa:restricted:${sessionId}`;

export async function markSessionRestricted(sessionId: string, until: Date, r: RedisLike = client()) {
  const ttl = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  await r.set(restrictedKey(sessionId), String(until.getTime()), 'EX', ttl);
}

/** Até quando as automações do número estão pausadas (null = liberado). */
export async function getRestrictedUntil(sessionId: string, r: RedisLike = client()): Promise<Date | null> {
  const raw = await r.get(restrictedKey(sessionId));
  if (!raw) return null;
  const until = Number(raw);
  return Number.isFinite(until) && until > Date.now() ? new Date(until) : null;
}
