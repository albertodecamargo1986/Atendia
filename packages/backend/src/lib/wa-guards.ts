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
import prisma from './prisma.js';

/** Subconjunto do ioredis usado aqui (permite um fake em memória nos testes). */
export interface RedisLike {
  set(key: string, value: string, ...args: any[]): Promise<any>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<any>;
}

const client = (): RedisLike => redis as unknown as RedisLike;

export const DAY_SEC = 86_400;
export const TWELVE_HOURS_SEC = 12 * 3600;

/** SET NX com expiração: true só para quem pegou a trava agora. */
export async function claimOnce(key: string, ttlSec: number, r: RedisLike = client()): Promise<boolean> {
  const res = await r.set(key, '1', 'EX', ttlSec, 'NX');
  return res === 'OK';
}

/** Libera uma trava (ex.: o processamento falhou depois de pegá-la e precisa poder repetir). */
export async function releaseClaim(key: string, r: RedisLike = client()) {
  await r.del(key);
}

export const incomingKey = (sessionId: string, messageId: string) => `wa:in:${sessionId}:${messageId}`;

/** Mensagem recebida já processada? (dedupe por msg.key.id, 24 h) */
export async function isDuplicateIncoming(sessionId: string, messageId: string | null | undefined, r: RedisLike = client()) {
  if (!messageId) return false;
  const claimed = await claimOnce(incomingKey(sessionId, messageId), DAY_SEC, r);
  return !claimed;
}

// ─── Anti-loop robô ↔ robô ──────────────────────────────────────────────────

export const AI_LIMIT_10_MIN = 8;
export const AI_LIMIT_1_HOUR = 30;
export const AI_LOOP_PAUSE_TEXT = 'Pausamos a IA: possível conversa com robô';

const INCR_WITH_TTL_LUA =
  "local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return n";

/** INCR + EXPIRE atômicos (Lua): a chave nunca fica sem expiração se o processo cair no meio. */
export async function incrWithTtl(key: string, ttlSec: number, r: RedisLike = client()): Promise<number> {
  return Number(await r.eval(INCR_WITH_TTL_LUA, 1, key, ttlSec));
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
/** Janela da repetição: só conta se vier em seguida (3 min). */
export const REPEAT_WINDOW_SEC = 180;
/** Rótulos de mídia ("[Imagem]", "[Áudio]"...) não contam como texto repetido. */
const MEDIA_LABEL = /^\[(Áudio|Audio|Imagem|Vídeo|Video|Documento|Figurinha|Sticker|Contato|Contatos|Localização|Mídia)[\]:]/i;

function hashText(text: string): string {
  return crypto.createHash('sha1').update(text.trim().toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Registra a mensagem do cliente e diz quantas vezes seguidas ela se repetiu (1 = primeira).
 * A IA ignora a partir da 4ª repetição idêntica seguida.
 */
export async function trackRepeatedMessage(conversationId: string, text: string, r: RedisLike = client()): Promise<number> {
  const key = `ai:repeat:${conversationId}`;
  if (!text || MEDIA_LABEL.test(text.trim())) {
    await r.del(key);
    return 1;
  }
  const h = hashText(text);
  let count = 1;
  const raw = await r.get(key);
  if (raw) {
    try {
      const prev = JSON.parse(raw) as { h: string; n: number };
      if (prev.h === h) count = (prev.n || 1) + 1;
    } catch { /* valor inválido: recomeça */ }
  }
  await r.set(key, JSON.stringify({ h, n: count }), 'EX', REPEAT_WINDOW_SEC);
  return count;
}

/** A IA respondeu: a contagem de repetição recomeça. */
export async function resetRepeatedMessage(conversationId: string, r: RedisLike = client()) {
  await r.del(`ai:repeat:${conversationId}`);
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
/** Cache em memória da leitura no banco (evita 1 consulta por envio quando o Redis está vazio). */
const restrictionDbCache = new Map<string, { until: number | null; at: number }>();
const RESTRICTION_DB_CACHE_MS = 30_000;

export async function markSessionRestricted(sessionId: string, until: Date, r: RedisLike = client()) {
  const ttl = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  await r.set(restrictedKey(sessionId), String(until.getTime()), 'EX', ttl);
  restrictionDbCache.set(sessionId, { until: until.getTime(), at: Date.now() });
}

/** Remove a pausa (painel: OWNER/ADMIN "limpar restrição"). */
export async function clearSessionRestriction(sessionId: string, r: RedisLike = client()) {
  await r.del(restrictedKey(sessionId));
  restrictionDbCache.set(sessionId, { until: null, at: Date.now() });
}

/**
 * Até quando as automações do número estão pausadas (null = liberado).
 * Redis primeiro; se o Redis perdeu a chave, a coluna restrictedUntil do banco (cache de 30 s)
 * — e a chave é regravada no Redis.
 */
export async function getRestrictedUntil(sessionId: string, r: RedisLike = client()): Promise<Date | null> {
  const raw = await r.get(restrictedKey(sessionId));
  const cachedUntil = raw ? Number(raw) : NaN;
  if (Number.isFinite(cachedUntil) && cachedUntil > Date.now()) return new Date(cachedUntil);

  let persisted: number | null;
  const cached = restrictionDbCache.get(sessionId);
  if (cached && Date.now() - cached.at < RESTRICTION_DB_CACHE_MS) {
    persisted = cached.until;
  } else {
    try {
      const session = await prisma.whatsAppSession.findUnique({ where: { sessionId }, select: { restrictedUntil: true } });
      persisted = session?.restrictedUntil ? session.restrictedUntil.getTime() : null;
    } catch {
      persisted = null;
    }
    restrictionDbCache.set(sessionId, { until: persisted, at: Date.now() });
  }
  if (!persisted || persisted <= Date.now()) return null;
  await markSessionRestricted(sessionId, new Date(persisted), r);
  return new Date(persisted);
}

/** Testes: zera o cache em memória. */
export function _resetRestrictionCache() {
  restrictionDbCache.clear();
}

// ─── Incidentes de restrição ────────────────────────────────────────────────

export const INCIDENT_WINDOW_DAYS = 30;

/** Mantém só os incidentes dos últimos 30 dias e acrescenta o novo. */
export function addRestrictionIncident(previous: unknown, at: Date = new Date()): string[] {
  const list = Array.isArray(previous) ? previous.filter((v): v is string => typeof v === 'string') : [];
  const cutoff = at.getTime() - INCIDENT_WINDOW_DAYS * 86_400_000;
  return [...list.filter((iso) => Date.parse(iso) >= cutoff), at.toISOString()];
}

/** 2ª restrição em 30 dias → desliga campanhas do número. */
export function shouldDisableCampaigns(incidents: string[]): boolean {
  return incidents.length >= 2;
}
