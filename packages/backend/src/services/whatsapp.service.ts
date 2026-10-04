import prisma from '../lib/prisma.js';
import { randomUUID } from 'crypto';
import { NotFoundError, LimitError, ForbiddenError } from '../lib/errors.js';
import { getUploadRoot, getWhatsAppAuthDir } from '../config/index.js';
import { isOverLimit } from '../lib/limits.js';
import { isIgnoredJid, toWhatsAppJid } from '../lib/whatsapp-jid.js';
import { uploadPathToUrl } from '../lib/uploads.js';
import { getIO } from '../lib/socket.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  proto,
  generateMessageIDV2,
  DEFAULT_CONNECTION_CONFIG,
  WAMessageStatus,
  type WASocket,
  type WAMessageKey,
  type AnyMessageContent,
  type CacheStore,
} from '@whiskeysockets/baileys';
import type { Boom } from '@hapi/boom';
import P from 'pino';
import redis from '../lib/redis.js';
import { offhoursMessageQueue, whatsappOutboundQueue, audioTranscriptionQueue } from '../workers/queues.js';
import { isWithinBusinessHours } from './business-hours.service.js';
import { findOrCreateContact } from './contact.service.js';
import { findOrCreateTicket } from './ticket.service.js';
import { dispatchTicket } from './ticket.dispatcher.js';
import { getQueueForWhatsapp } from './queue.service.js';
import { downloadWhatsAppMedia, MAX_INCOMING_MEDIA_BYTES } from './voice.service.js';
import { emitWebhookEvent } from './webhook.service.js';
import { scheduleAiResponse } from '../lib/ai-schedule.js';
import {
  decideReconnect,
  reconnectBackoffMs,
  typingDelayMs,
  sleep,
  KeyedSerializer,
  MAX_RECONNECT_ATTEMPTS,
  STABLE_CONNECTION_MS,
  RESTART_REQUIRED_DELAY_MS,
  DISCONNECT_REASON_TEXT,
  recordDisconnect,
  type ReconnectDecision,
} from '../lib/wa-pacing.js';
import {
  claimOnce,
  isDuplicateIncoming,
  rememberSentMessage,
  getSentMessage,
  trackRepeatedMessage,
  shouldIgnoreRepeated,
  TWELVE_HOURS_SEC,
  DAY_SEC,
  countSendError,
  shouldRestrictOnAckError,
  markSessionRestricted,
  getRestrictedUntil,
  RESTRICTION_PAUSE_MS,
} from '../lib/wa-guards.js';
import { extractMessageText, getMediaInfo, isFreshMessage, resolveSender } from '../lib/wa-message.js';
import { isOptOutMessage, OPT_OUT_REPLY } from '../lib/opt-out.js';

const connectSchema = z.object({
  // Só letras, números, _ e - (vira nome de pasta dentro de WHATSAPP_AUTH_DIR)
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'Identificador de sessão inválido').optional(),
  agentId: z.string().uuid().nullable().optional(),
});

const updateSessionSchema = z.object({
  agentId: z.string().uuid('Agente inválido').nullable().optional(),
});

// Diretório das credenciais do Baileys (config WHATSAPP_AUTH_DIR; produção: /app/data/whatsapp-auth)
const AUTH_DIR = getWhatsAppAuthDir();
const SESSION_ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY;
if (!SESSION_ENCRYPTION_KEY || SESSION_ENCRYPTION_KEY.length < 32) {
  throw new Error('SESSION_ENCRYPTION_KEY is required and must be at least 32 characters. Set a strong key in your .env file.');
}

const baileysLogger = P({ level: 'silent' });

// ─── Estado dos sockets (um por sessão, nunca dois) ─────────────────────────
const activeSockets = new Map<string, WASocket>();
/** Sessões paradas de propósito (desconectar/excluir/reconectar): o "close" não reconecta. */
const manualStop = new Set<string>();
const reconnectTimers = new Map<string, NodeJS.Timeout>();
const stableTimers = new Map<string, NodeJS.Timeout>();
/** Trava de start por sessão: chamadas simultâneas reaproveitam a mesma promessa. */
const starting = new Map<string, Promise<void>>();
const reconnectAttempts = new Map<string, number>();
/** 515 (restartRequired) já usado desde a última conexão aberta — evita loop. */
const restartUsed = new Set<string>();
/** 500 (badSession) já teve a sua única nova tentativa. */
const badSessionRetried = new Set<string>();
/** 405 (versão velha) já teve a sua única nova tentativa com versão recém-buscada. */
const versionRetried = new Set<string>();
/** Horários das quedas transitórias por sessão (janela de 1 h). */
const disconnectHistory = new Map<string, number[]>();
const retryCounterCaches = new Map<string, CacheStore>();

/** Um envio por vez por número + 1,2 s mínimo entre mensagens do mesmo número. */
const sendSerializer = new KeyedSerializer();
/** Última mensagem do cliente ainda não lida, por sessão+contato (para o "visto" antes de responder). */
const pendingReadKeys = new Map<string, WAMessageKey>();
/** Ids gerados pelo sistema (separar o que foi enviado pelo celular do atendente). */
const sentIds = new Set<string>();
const SENT_IDS_CAP = 5000;

const SOCKET_EVENTS = ['connection.update', 'creds.update', 'messages.upsert', 'messages.update'] as const;

/** Cache simples em memória (interface CacheStore do Baileys) — sem dependência nova. */
export class SimpleCache implements CacheStore {
  private store = new Map<string, { value: unknown; expires: number }>();
  constructor(private readonly ttlMs = 10 * 60_000, private readonly max = 5000) {}
  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }
  set<T>(key: string, value: T): void {
    if (this.store.size >= this.max) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }
  del(key: string): void {
    this.store.delete(key);
  }
  flushAll(): void {
    this.store.clear();
  }
}

// ─── Versão do WhatsApp Web (cache 24 h + último valor bom no Redis) ────────
// A versão embutida na 6.7.x fica velha e leva a 405 (client_too_old): sempre passamos `version`.
type WaVersion = [number, number, number];
const VERSION_REDIS_KEY = 'wa:version:last-good';
let versionCache: { version: WaVersion; expires: number } | null = null;

function newerVersion(a: WaVersion | null | undefined, b: WaVersion | null | undefined): WaVersion | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? a : b;
  }
  return a;
}

export async function getWaVersion(force = false): Promise<WaVersion | undefined> {
  if (!force && versionCache && versionCache.expires > Date.now()) return versionCache.version;

  let fetched: { version: WaVersion; isLatest?: boolean; error?: unknown } | null = null;
  try {
    fetched = (await fetchLatestBaileysVersion()) as any;
  } catch (err) {
    fetched = null;
  }

  if (fetched?.version && !fetched.error && fetched.isLatest !== false) {
    versionCache = { version: fetched.version, expires: Date.now() + 24 * 3600_000 };
    try { await redis.set(VERSION_REDIS_KEY, JSON.stringify(fetched.version)); } catch { /* não crítico */ }
    return fetched.version;
  }

  // Falhou: último valor bom (Redis) ou a embutida — a mais nova das duas — com aviso no log
  let lastGood: WaVersion | null = null;
  try {
    const raw = await redis.get(VERSION_REDIS_KEY);
    if (raw) lastGood = JSON.parse(raw);
  } catch { /* sem Redis */ }
  const embedded = (fetched?.version || (DEFAULT_CONNECTION_CONFIG.version as WaVersion)) ?? null;
  const chosen = newerVersion(lastGood, embedded);
  console.warn(
    `[WhatsApp] Não foi possível obter a versão atual do WhatsApp Web; usando ${chosen?.join('.')} ` +
    `(${chosen === lastGood ? 'último valor bom em cache' : 'versão embutida na biblioteca'}).`,
  );
  if (chosen) versionCache = { version: chosen, expires: Date.now() + 3600_000 };
  return chosen;
}

function emitStatus(tenantId: string, payload: Record<string, unknown>) {
  try {
    getIO().to(`tenant:${tenantId}`).emit('whatsapp:status', payload);
  } catch { /* socket.io indisponível (testes/boot) */ }
}

function emitToTenant(tenantId: string, event: string, payload: unknown) {
  try {
    getIO().to(`tenant:${tenantId}`).emit(event, payload);
  } catch { /* socket.io indisponível */ }
}

async function ensureAuthRoot() {
  await fs.mkdir(AUTH_DIR, { recursive: true });
}

/** Pasta de credenciais com permissão 700 (só o usuário do processo). */
async function ensureAuthDir(authDir: string) {
  await fs.mkdir(authDir, { recursive: true, mode: 0o700 });
  await fs.chmod(authDir, 0o700).catch(() => {});
}

/** A sessão já tem login (QR lido)? Lê creds.json: `me.id` só existe depois de parear. */
export async function hasRegisteredCreds(authDir: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(path.join(authDir, 'creds.json'), 'utf8');
    const creds = JSON.parse(raw);
    return !!(creds?.me?.id || creds?.registered);
  } catch {
    return false;
  }
}

function clearTimer(map: Map<string, NodeJS.Timeout>, sessionId: string) {
  const t = map.get(sessionId);
  if (t) clearTimeout(t);
  map.delete(sessionId);
}

/** Desliga o socket atual da sessão SEM disparar reconexão (remove os listeners antes). */
function teardownSocket(sessionId: string) {
  clearTimer(stableTimers, sessionId);
  const sock = activeSockets.get(sessionId);
  if (!sock) return;
  activeSockets.delete(sessionId);
  for (const ev of SOCKET_EVENTS) {
    try { sock.ev.removeAllListeners(ev); } catch { /* ignora */ }
  }
  try { sock.end(undefined); } catch { /* ignora */ }
}

/** Parada intencional: marca manualStop, cancela reconexões pendentes e encerra o socket. */
function stopSession(sessionId: string) {
  manualStop.add(sessionId);
  clearTimer(reconnectTimers, sessionId);
  reconnectAttempts.delete(sessionId);
  restartUsed.delete(sessionId);
  badSessionRetried.delete(sessionId);
  versionRetried.delete(sessionId);
  teardownSocket(sessionId);
}

export function getActiveSocket(sessionId: string): WASocket | undefined {
  return activeSockets.get(sessionId);
}

/** Diagnóstico/testes: quantos sockets e timers de reconexão existem. */
export function getConnectionDebugState() {
  return {
    sockets: [...activeSockets.keys()],
    reconnectTimers: [...reconnectTimers.keys()],
    manualStop: [...manualStop],
    starting: [...starting.keys()],
  };
}

export async function listSessions(tenantId: string) {
  return prisma.whatsAppSession.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: { agent: { select: { id: true, name: true, isActive: true } } },
  });
}

/** Garante que o agente pertence ao tenant. */
async function assertAgentOfTenant(tenantId: string, agentId: string | null | undefined) {
  if (!agentId) return;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, tenantId }, select: { id: true } });
  if (!agent) throw new NotFoundError('Agente', agentId);
}

/** PATCH /api/whatsapp/:id — define qual agente atende este número. */
export async function updateSession(tenantId: string, sessionId: string, data: unknown) {
  const parsed = updateSessionSchema.parse(data ?? {});
  const session = await prisma.whatsAppSession.findFirst({ where: { id: sessionId, tenantId } });
  if (!session) throw new NotFoundError('Sessão WhatsApp', sessionId);

  if (parsed.agentId !== undefined) {
    await assertAgentOfTenant(tenantId, parsed.agentId);
  }

  return prisma.whatsAppSession.update({
    where: { id: sessionId },
    data: parsed.agentId !== undefined ? { agentId: parsed.agentId } : {},
    include: { agent: { select: { id: true, name: true, isActive: true } } },
  });
}

export async function connectSession(tenantId: string, data?: z.infer<typeof connectSchema>) {
  const parsed = connectSchema.parse(data ?? {});
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Empresa', tenantId);

  await assertAgentOfTenant(tenantId, parsed.agentId);

  // Limpa sessões órfãs SÓ deste tenant antes de checar o limite
  await cleanupOrphanSessions(tenantId);

  // Only count active sessions (CONNECTED, CONNECTING, DISCONNECTED) against limit
  const sessionCount = await prisma.whatsAppSession.count({
    where: {
      tenantId,
      status: { in: ['CONNECTED', 'CONNECTING', 'DISCONNECTED'] }
    }
  });
  if (isOverLimit(sessionCount, tenant.maxWhatsapp)) {
    throw new LimitError(`Limite de números de WhatsApp atingido (${tenant.maxWhatsapp}). Mude de plano para conectar mais.`);
  }

  const sessionId = parsed.sessionId || `wa_${tenantId}_${randomUUID()}`;
  await ensureAuthRoot();
  const authDir = path.join(AUTH_DIR, sessionId);
  await ensureAuthDir(authDir);

  // phoneNumber fica NULL até conectar (coluna é única — '' conflitaria)
  const session = await prisma.whatsAppSession.create({
    data: {
      tenantId,
      sessionId,
      phoneNumber: null,
      status: 'CONNECTING',
      agentId: parsed.agentId ?? null,
    },
  });

  await startBaileysSession(tenantId, session.id, sessionId, authDir);

  return session;
}

/**
 * Inicia o socket da sessão. Nunca deixa dois sockets para a mesma sessão:
 * chamadas simultâneas compartilham a mesma promessa e o socket anterior é encerrado antes.
 * @param opts.fromTimer chamado por um timer de reconexão (respeita manualStop)
 */
export function startBaileysSession(
  tenantId: string,
  dbSessionId: string,
  sessionId: string,
  authDir: string,
  opts: { fromTimer?: boolean } = {},
): Promise<void> {
  const inFlight = starting.get(sessionId);
  if (inFlight) return inFlight;
  const p = doStartSession(tenantId, dbSessionId, sessionId, authDir, !!opts.fromTimer)
    .finally(() => starting.delete(sessionId));
  starting.set(sessionId, p);
  return p;
}

async function doStartSession(
  tenantId: string,
  dbSessionId: string,
  sessionId: string,
  authDir: string,
  fromTimer: boolean,
) {
  if (fromTimer && manualStop.has(sessionId)) return;
  if (!fromTimer) manualStop.delete(sessionId);
  clearTimer(reconnectTimers, sessionId);
  teardownSocket(sessionId);

  try {
    await ensureAuthDir(authDir);
    // Depois de um 405 (versão velha), busca a versão atual de novo
    const version = await getWaVersion(versionRetried.has(sessionId));
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    // Parado enquanto carregava as credenciais
    if (manualStop.has(sessionId)) return;

    let retryCache = retryCounterCaches.get(sessionId);
    if (!retryCache) {
      retryCache = new SimpleCache(60 * 60_000);
      retryCounterCaches.set(sessionId, retryCache);
    }

    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
      printQRInTerminal: false,
      logger: baileysLogger,
      // Assinatura de um navegador comum (não um nome de produto)
      browser: Browsers.ubuntu('Chrome'),
      // Não aparece "online" ao conectar nem baixa o histórico inteiro
      markOnlineOnConnect: false,
      syncFullHistory: false,
      keepAliveIntervalMs: 30_000,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      retryRequestDelayMs: 350,
      maxMsgRetryCount: 5,
      msgRetryCounterCache: retryCache,
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: (jid: string) => isIgnoredJid(jid),
      // Reenvio de mensagens que o destinatário não conseguiu decifrar
      getMessage: async (key) => {
        if (!key?.id) return undefined;
        try {
          const raw = await getSentMessage(sessionId, key.id);
          return raw ? proto.Message.decode(Buffer.from(raw, 'base64')) : undefined;
        } catch {
          return undefined;
        }
      },
    });

    activeSockets.set(sessionId, sock);
    const ctx: SessionCtx = { tenantId, dbSessionId, sessionId, authDir, sock, state };

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
      handleConnectionUpdate(ctx, update).catch((err) =>
        console.error(`[WhatsApp:${sessionId}] erro em connection.update:`, err?.message));
    });
    sock.ev.on('messages.upsert', (m) => {
      handleMessagesUpsert(ctx, m).catch((err) =>
        console.error(`[WhatsApp:${sessionId}] erro em messages.upsert:`, err?.message));
    });
    // Acks de erro dos envios (463 = restrição temporária na 6.7.x chega aqui)
    sock.ev.on('messages.update', (updates) => {
      handleMessageUpdates(ctx, updates).catch((err) =>
        console.error(`[WhatsApp:${sessionId}] erro em messages.update:`, err?.message));
    });
  } catch (err: any) {
    console.error(`Failed to start Baileys session ${sessionId}:`, err.message);

    await prisma.whatsAppSession.update({
      where: { id: dbSessionId },
      data: { status: 'DISCONNECTED' },
    }).catch(() => {});

    emitStatus(tenantId, { sessionId: dbSessionId, status: 'DISCONNECTED', error: err.message });
  }
}

interface SessionCtx {
  tenantId: string;
  dbSessionId: string;
  sessionId: string;
  authDir: string;
  sock: WASocket;
  state: { creds: { me?: { id?: string } | null } };
}

function scheduleReconnect(ctx: SessionCtx, delayMs: number) {
  clearTimer(reconnectTimers, ctx.sessionId);
  const timer = setTimeout(() => {
    reconnectTimers.delete(ctx.sessionId);
    if (manualStop.has(ctx.sessionId)) return;
    startBaileysSession(ctx.tenantId, ctx.dbSessionId, ctx.sessionId, ctx.authDir, { fromTimer: true })
      .catch((err) => {
        console.error(`Reconnection attempt failed for ${ctx.sessionId}:`, err?.message);
        emitStatus(ctx.tenantId, { sessionId: ctx.dbSessionId, status: 'FAILED', error: err?.message });
      });
  }, delayMs);
  reconnectTimers.set(ctx.sessionId, timer);
}

async function handleConnectionUpdate(ctx: SessionCtx, update: any) {
  const { tenantId, dbSessionId, sessionId, sock } = ctx;
  const { connection, lastDisconnect, qr } = update;

  // Socket "fantasma" (já substituído ou parado de propósito): ignora tudo
  if (manualStop.has(sessionId) || activeSockets.get(sessionId) !== sock) return;

  if (qr) {
    // Guarda o QR no banco para o painel buscar mesmo sem socket.io
    await prisma.whatsAppSession.update({
      where: { id: dbSessionId },
      data: { qrCode: qr, status: 'CONNECTING' },
    }).catch(() => {});
    emitToTenant(tenantId, 'whatsapp:qr', { sessionId: dbSessionId, baileysSessionId: sessionId, qr });
  }

  if (connection === 'close') {
    activeSockets.delete(sessionId);
    clearTimer(stableTimers, sessionId);
    for (const ev of SOCKET_EVENTS) {
      try { sock.ev.removeAllListeners(ev); } catch { /* ignora */ }
    }

    const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
    const registered = !!ctx.state.creds?.me?.id;
    let history = disconnectHistory.get(sessionId);
    if (!history) {
      history = [];
      disconnectHistory.set(sessionId, history);
    }
    const preview = decideReconnect(code, { registered });
    const recentDisconnects = preview.action === 'backoff' ? recordDisconnect(history) : history.length;
    let decision: ReconnectDecision = decideReconnect(code, {
      registered,
      badSessionRetried: badSessionRetried.has(sessionId),
      versionRetried: versionRetried.has(sessionId),
      recentDisconnects,
    });
    // 515 só reconecta 1x sem contar tentativa; se repetir sem abrir, vira backoff normal
    if (decision.action === 'restart' && restartUsed.has(sessionId)) {
      decision = decideReconnect(undefined, { registered: true, recentDisconnects });
    }
    console.log(`[WhatsApp:${sessionId}] conexão fechada (código ${code ?? '?'}) → ${decision.action}`);
    await applyDisconnectDecision(ctx, decision);
    return;
  }

  if (connection === 'open') {
    restartUsed.delete(sessionId);
    badSessionRetried.delete(sessionId);
    versionRetried.delete(sessionId);
    // A contagem de tentativas só zera depois de 60 s estável
    clearTimer(stableTimers, sessionId);
    stableTimers.set(sessionId, setTimeout(() => {
      stableTimers.delete(sessionId);
      reconnectAttempts.delete(sessionId);
    }, STABLE_CONNECTION_MS));

    const phoneNumber = sock.user?.id?.split(':')[0]?.split('@')[0] || null;
    if (phoneNumber) await releaseSameNumberSessions(tenantId, dbSessionId, phoneNumber);

    try {
      await prisma.whatsAppSession.update({
        where: { id: dbSessionId },
        data: { status: 'CONNECTED', phoneNumber, qrCode: null, lastConnectedAt: new Date() },
      });
    } catch (err: any) {
      // Número ainda registrado em sessão de OUTRA empresa (coluna única): conecta sem gravar o número
      await prisma.whatsAppSession.update({
        where: { id: dbSessionId },
        data: { status: 'CONNECTED', qrCode: null, lastConnectedAt: new Date() },
      }).catch(() => {});
      console.warn(`[WhatsApp:${sessionId}] número ${phoneNumber} já registrado em outra sessão:`, err?.code || err?.message);
    }

    emitStatus(tenantId, { sessionId: dbSessionId, status: 'CONNECTED', phoneNumber });
    emitWebhookEvent(tenantId, 'whatsapp.connected', { sessionId: dbSessionId, phoneNumber });
  }
}

async function applyDisconnectDecision(ctx: SessionCtx, decision: ReconnectDecision) {
  const { tenantId, dbSessionId, sessionId, authDir } = ctx;

  if (decision.clearCreds) {
    await fs.rm(authDir, { recursive: true, force: true }).catch(() => {});
    await ensureAuthDir(authDir).catch(() => {});
  }

  if (decision.reconnect) {
    let delay: number;
    if (decision.action === 'restart') {
      restartUsed.add(sessionId);
      delay = RESTART_REQUIRED_DELAY_MS;
    } else if (decision.action === 'retry_once') {
      badSessionRetried.add(sessionId);
      delay = reconnectBackoffMs(1);
    } else if (decision.action === 'version_outdated') {
      versionRetried.add(sessionId);
      versionCache = null;
      console.warn(`[WhatsApp:${sessionId}] 405 (versão do WhatsApp Web desatualizada): tentando 1x com a versão atual`);
      delay = 2_000;
    } else {
      const attempts = (reconnectAttempts.get(sessionId) || 0) + 1;
      if (attempts > MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.delete(sessionId);
        console.warn(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${sessionId}`);
        await prisma.whatsAppSession.update({
          where: { id: dbSessionId },
          data: { status: 'DISCONNECTED', qrCode: null },
        }).catch(() => {});
        emitStatus(tenantId, {
          sessionId: dbSessionId, status: 'FAILED', reason: 'MAX_ATTEMPTS',
          message: DISCONNECT_REASON_TEXT.MAX_ATTEMPTS, error: 'Max reconnection attempts reached',
        });
        emitWebhookEvent(tenantId, 'whatsapp.disconnected', { sessionId: dbSessionId, reason: 'MAX_ATTEMPTS' });
        return;
      }
      reconnectAttempts.set(sessionId, attempts);
      delay = reconnectBackoffMs(attempts);
      console.log(`[WhatsApp:${sessionId}] Reconnect attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
    }
    await prisma.whatsAppSession.update({ where: { id: dbSessionId }, data: { status: 'CONNECTING' } }).catch(() => {});
    emitStatus(tenantId, { sessionId: dbSessionId, status: 'CONNECTING' });
    scheduleReconnect(ctx, delay);
    return;
  }

  // Sem reconexão automática
  reconnectAttempts.delete(sessionId);
  restartUsed.delete(sessionId);
  badSessionRetried.delete(sessionId);
  versionRetried.delete(sessionId);
  disconnectHistory.delete(sessionId);
  await prisma.whatsAppSession.update({
    where: { id: dbSessionId },
    data: { status: decision.status === 'BANNED' ? 'BANNED' : 'DISCONNECTED', qrCode: null },
  }).catch(() => {});

  const reason = decision.reason;
  emitStatus(tenantId, {
    sessionId: dbSessionId,
    status: decision.status,
    reason,
    message: reason ? DISCONNECT_REASON_TEXT[reason] : undefined,
  });
  if (decision.status === 'BANNED') {
    emitToTenant(tenantId, 'whatsapp:banned', { sessionId: dbSessionId, message: DISCONNECT_REASON_TEXT.BANNED });
  }
  emitWebhookEvent(tenantId, 'whatsapp.disconnected', { sessionId: dbSessionId, reason: reason || decision.action });
}

/**
 * O mesmo número foi conectado em outra sessão DESTA empresa: desconecta (logout) a antiga
 * para não ficarem dois aparelhos vinculados disputando o número.
 */
async function releaseSameNumberSessions(tenantId: string, dbSessionId: string, phoneNumber: string) {
  const others = await prisma.whatsAppSession.findMany({
    where: { tenantId, phoneNumber, id: { not: dbSessionId } },
  }).catch(() => [] as any[]);

  for (const other of others) {
    const oldSock = activeSockets.get(other.sessionId);
    stopSession(other.sessionId);
    if (oldSock) {
      try {
        await Promise.race([oldSock.logout('Número conectado em outra sessão'), sleep(5000)]);
      } catch { /* já desconectado */ }
    }
    await prisma.whatsAppSession.update({
      where: { id: other.id },
      data: { phoneNumber: null, status: 'DISCONNECTED', qrCode: null },
    }).catch(() => {});
    emitStatus(tenantId, {
      sessionId: other.id, status: 'DISCONNECTED', reason: 'CONNECTION_REPLACED',
      message: 'Este número foi conectado em outra sessão.',
    });
  }
}

// ─── Mensagens recebidas ────────────────────────────────────────────────────

async function handleMessagesUpsert(ctx: SessionCtx, m: { type: string; messages: any[]; requestId?: string }) {
  // 'append' (recebidas offline/histórico) e reenvio de placeholder (requestId — vetor da GHSA-qvv5)
  // são só GRAVADAS: nunca disparam IA, saudação, aviso ou opt-out
  const recordOnly = m.type !== 'notify' || !!m.requestId;
  for (const msg of m.messages || []) {
    if (!msg?.key?.remoteJid || !msg.message) continue;
    // Socket substituído no meio do lote: não processa em dobro
    if (activeSockets.get(ctx.sessionId) !== ctx.sock) return;
    if (msg.key.fromMe) {
      // Enviado pelo celular do atendente (nossos envios chegam como 'append' e estão registrados)
      if (m.type === 'notify') await handleOwnPhoneMessage(ctx, msg);
      continue;
    }
    if (m.type !== 'notify' && m.type !== 'append') continue;
    await handleIncomingMessage(ctx, msg, Date.now(), { recordOnly });
  }
}

/** Telefone/LID do remetente: com @lid sem senderPn, tenta o contato já conhecido por esse LID. */
async function resolveContactIdentity(tenantId: string, msg: any) {
  const sender = resolveSender(msg);
  let phone = sender.phone;
  if (!phone && sender.lid) {
    const known = await prisma.contact.findFirst({ where: { tenantId, lid: sender.lid }, select: { phone: true } });
    phone = known?.phone || sender.lid.split('@')[0].split(':')[0];
  }
  return { phone: phone || '', lid: sender.lid, replyJid: sender.replyJid };
}

const CONVERSATION_OPEN_STATUSES = ['ACTIVE', 'PENDING', 'HUMAN_TAKEOVER'] as const;
const CONVERSATION_REACTIVATE_HOURS = 2;

/**
 * Conversa do contato NESTE número (conversa = contato + sessão).
 * Encerrada há < 2 h → reativada (o ticket será reaberto apontando para ela).
 */
async function findOrCreateWhatsAppConversation(
  tenantId: string,
  dbSessionId: string,
  contact: { id: string },
  contactPhone: string,
  contactName: string,
) {
  const sessionFilter = { OR: [{ whatsappSessionId: dbSessionId }, { whatsappSessionId: null }] };

  const open = await prisma.conversation.findFirst({
    where: { tenantId, contactPhone, status: { in: [...CONVERSATION_OPEN_STATUSES] }, ...sessionFilter },
    orderBy: { updatedAt: 'desc' },
    include: { agent: true },
  });
  if (open) {
    const patch: Record<string, unknown> = {};
    if (!open.contactId) patch.contactId = contact.id;
    if (!open.whatsappSessionId) patch.whatsappSessionId = dbSessionId;
    if (open.status === 'PENDING') patch.status = 'ACTIVE'; // legado (fora do horário)
    if (Object.keys(patch).length) {
      return prisma.conversation.update({ where: { id: open.id }, data: patch, include: { agent: true } });
    }
    return open;
  }

  const recent = await prisma.conversation.findFirst({
    where: {
      tenantId,
      contactPhone,
      status: 'RESOLVED',
      updatedAt: { gte: new Date(Date.now() - CONVERSATION_REACTIVATE_HOURS * 3600_000) },
      ...sessionFilter,
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (recent) {
    const reactivated = await prisma.conversation.update({
      where: { id: recent.id },
      data: { status: 'ACTIVE', assignedTo: null, contactId: contact.id, whatsappSessionId: dbSessionId },
      include: { agent: true },
    });
    emitToTenant(tenantId, 'conversation:updated', { conversation: reactivated });
    return reactivated;
  }

  // Agente definido para este número; senão, o primeiro agente ativo do tenant
  const session = await prisma.whatsAppSession.findUnique({ where: { id: dbSessionId }, select: { agentId: true } });
  let agent = session?.agentId
    ? await prisma.agent.findFirst({ where: { id: session.agentId, tenantId, isActive: true } })
    : null;
  if (!agent) {
    agent = await prisma.agent.findFirst({ where: { tenantId, isActive: true }, orderBy: { createdAt: 'asc' } });
  }
  if (!agent) return null;

  return prisma.conversation.create({
    data: {
      tenantId,
      agentId: agent.id,
      channel: 'WHATSAPP',
      contactName,
      contactPhone,
      contactId: contact.id,
      whatsappSessionId: dbSessionId,
      status: 'ACTIVE',
    },
    include: { agent: true },
  });
}

function emitMessage(tenantId: string, conversationId: string, message: unknown) {
  try {
    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('message:new', { conversationId, message });
    io.to(`conversation:${conversationId}`).emit('message:new', { conversationId, message });
  } catch { /* socket.io indisponível */ }
}

export async function handleIncomingMessage(
  ctx: SessionCtx,
  msg: any,
  nowMs: number = Date.now(),
  opts: { recordOnly?: boolean } = {},
) {
  const { tenantId, sessionId, dbSessionId, sock } = ctx;
  try {
    const remoteJid: string = msg.key.remoteJid;
    // Grupos, status, broadcast e canais: a IA nunca responde
    if (isIgnoredJid(remoteJid)) return;
    // O mesmo id do WhatsApp só é processado 1x (reenvios/reconexões)
    if (await isDuplicateIncoming(sessionId, msg.key.id)) return;

    const text = extractMessageText(msg);
    const media = getMediaInfo(msg);
    if (!text && !media) return;

    const fresh = !opts.recordOnly && isFreshMessage(msg, nowMs);
    const identity = await resolveContactIdentity(tenantId, msg);
    if (!identity.phone) return;

    // "Visto" só quando formos responder (antes do envio, no serializador)
    pendingReadKeys.set(`${sessionId}|${identity.replyJid}`, msg.key);

    const contactName = msg.pushName || identity.phone;
    const contact = await findOrCreateContact(tenantId, identity.phone, contactName, undefined, false, identity.lid || undefined);

    const conversation = await findOrCreateWhatsAppConversation(tenantId, dbSessionId, contact, identity.phone, contactName);
    if (!conversation) return; // nenhum agente ativo

    // Mídia (≤ 16 MB) salva em uploads do tenant
    let mediaUrl: string | undefined;
    let mediaType: string | undefined;
    let mediaPath: string | undefined;
    if (media && media.kind !== 'STICKER') {
      mediaType = media.kind;
      if (media.fileLength && media.fileLength > MAX_INCOMING_MEDIA_BYTES) {
        // Muito grande: só registra
      } else {
        const saved = await downloadWhatsAppMedia(sock, msg, tenantId, media).catch(() => null);
        if (saved) {
          mediaPath = saved.filePath;
          mediaUrl = uploadPathToUrl(saved.filePath);
        }
      }
    }

    const content = text || '[Mídia]';
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content,
        mediaUrl,
        mediaType,
        metadata: {
          jid: identity.replyJid,
          remoteJid,
          sessionId,
          messageId: msg.key.id,
          ...(identity.lid ? { lid: identity.lid } : {}),
          ...(media?.kind === 'AUDIO' ? { audioUrl: mediaUrl ?? null, audioTranscribed: false } : {}),
          ...(fresh ? {} : { late: true }),
        },
      },
    });

    // Mensagem primeiro (painel), depois o atendimento
    emitMessage(tenantId, conversation.id, message);
    emitWebhookEvent(tenantId, 'message.received', {
      conversationId: conversation.id,
      messageId: message.id,
      contactPhone: identity.phone,
      contactName,
      content,
      mediaType: mediaType ?? null,
      whatsappSessionId: dbSessionId,
    });

    const queue = await getQueueForWhatsapp(tenantId, dbSessionId);
    const { ticket, created } = await findOrCreateTicket(
      tenantId, contact.id, conversation.id, dbSessionId, 1, content, false,
    );
    if (ticket) {
      try {
        getIO().to(`ticket:${ticket.id}`).emit('message:new', { conversationId: conversation.id, message });
      } catch { /* socket.io indisponível */ }
      if (queue && !ticket.queueId) {
        await prisma.ticket.update({ where: { id: ticket.id }, data: { queueId: queue.id } });
        // Com a fila definida, distribui para um atendente da fila (se houver)
        if (ticket.status === 'PENDING') await dispatchTicket(tenantId, ticket.id);
      }
    }

    const route = { sessionId, jid: identity.replyJid };

    // Opt-out (SAIR/PARAR/STOP...): marca e responde UMA vez; a IA não responde essa mensagem
    if (text && isOptOutMessage(text) && !opts.recordOnly) {
      if (!contact.optedOutAt) {
        await prisma.contact.update({ where: { id: contact.id }, data: { optedOutAt: new Date() } }).catch(() => {});
        if (fresh) {
          await queueAutomatedMessage({ tenantId, conversationId: conversation.id, ...route, content: OPT_OUT_REPLY, kind: 'opt-out' });
        }
      }
      return;
    }

    // Transcrição do áudio em job (fora do handler)
    const aiEligible = fresh && conversation.status === 'ACTIVE' && !!conversation.agent?.isActive;

    // Mensagens antigas (offline > 10 min) não disparam saudação, aviso nem IA
    if (!fresh) {
      if (mediaPath && media?.kind === 'AUDIO') await enqueueTranscription(tenantId, conversation.id, message.id, mediaPath, false);
      return;
    }

    // Saudação da fila: só para atendimento CRIADO agora e no máx. 1x a cada 12 h por conversa
    if (created && queue?.greetingMessage && await claimOnce(`greeting:${conversation.id}`, TWELVE_HOURS_SEC)) {
      await queueAutomatedMessage({ tenantId, conversationId: conversation.id, ...route, content: queue.greetingMessage, kind: 'greeting' });
    }

    if (!aiEligible) {
      if (mediaPath && media?.kind === 'AUDIO') await enqueueTranscription(tenantId, conversation.id, message.id, mediaPath, false);
      return;
    }

    if (!(await isWithinBusinessHours(tenantId))) {
      // Aviso de fora do horário: no máx. 1x a cada 12 h por conversa; status NÃO muda
      if (await claimOnce(`offhours:${conversation.id}`, TWELVE_HOURS_SEC)) {
        await offhoursMessageQueue.add('offhours', {
          tenantId,
          conversationId: conversation.id,
          agentName: conversation.agent.name,
        }, { jobId: `offhours-${conversation.id}` });
      }
      if (mediaPath && media?.kind === 'AUDIO') await enqueueTranscription(tenantId, conversation.id, message.id, mediaPath, false);
      return;
    }

    // A mesma mensagem idêntica repetida mais de 3x seguidas: não responde (robô/spam)
    const repeats = await trackRepeatedMessage(conversation.id, content);
    if (shouldIgnoreRepeated(repeats)) return;

    if (mediaPath && media?.kind === 'AUDIO') {
      // A IA responde depois da transcrição
      await enqueueTranscription(tenantId, conversation.id, message.id, mediaPath, true);
      return;
    }

    await scheduleAiResponse({
      tenantId,
      conversationId: conversation.id,
      agentId: conversation.agentId,
      triggerMessageId: message.id,
    });
  } catch (err: any) {
    console.error('Error handling incoming WhatsApp message:', err.message);
  }
}

async function enqueueTranscription(tenantId: string, conversationId: string, messageId: string, filePath: string, scheduleAi: boolean) {
  await audioTranscriptionQueue.add('transcribe', { tenantId, conversationId, messageId, filePath, scheduleAi }, {
    jobId: `transcribe-${messageId}`,
  });
}

/**
 * Mensagem enviada pelo CELULAR do atendente (fromMe que o sistema não enviou):
 * grava como mensagem do atendente e pausa a IA na conversa (HUMAN_TAKEOVER).
 */
export async function handleOwnPhoneMessage(ctx: SessionCtx, msg: any, nowMs: number = Date.now()) {
  const { tenantId, sessionId, dbSessionId } = ctx;
  try {
    const id: string | undefined = msg.key.id;
    if (!id) return;
    if (sentIds.has(id) || (await getSentMessage(sessionId, id))) return; // enviada pelo sistema
    if (isIgnoredJid(msg.key.remoteJid)) return;
    if (await isDuplicateIncoming(sessionId, id)) return;

    const text = extractMessageText(msg);
    if (!text) return;
    const identity = await resolveContactIdentity(tenantId, msg);
    if (!identity.phone) return;

    const conversation = await prisma.conversation.findFirst({
      where: {
        tenantId,
        contactPhone: identity.phone,
        status: { in: [...CONVERSATION_OPEN_STATUSES] },
        OR: [{ whatsappSessionId: dbSessionId }, { whatsappSessionId: null }],
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!conversation) return; // conversa fora do sistema: não interfere

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: text,
        metadata: { fromPhone: true, sessionId, jid: identity.replyJid, waMessageId: id, status: 'sent' },
      },
    });
    emitMessage(tenantId, conversation.id, message);

    if (conversation.status !== 'HUMAN_TAKEOVER' && isFreshMessage(msg, nowMs)) {
      const updated = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'HUMAN_TAKEOVER' },
      });
      const note = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'SYSTEM',
          content: 'Atendente respondeu pelo celular — IA pausada nesta conversa.',
        },
      });
      emitToTenant(tenantId, 'conversation:updated', { conversation: updated });
      emitMessage(tenantId, conversation.id, note);
    }
  } catch (err: any) {
    console.error('Error handling own-phone WhatsApp message:', err.message);
  }
}

// ─── Restrição temporária (463 / 475 / erros de envio seguidos) ─────────────

/** Acks de erro dos NOSSOS envios: 463/475 ou 3 erros em 10 min → pausa automações por 24 h. */
export async function handleMessageUpdates(ctx: SessionCtx, updates: any[]) {
  for (const u of updates || []) {
    if (!u?.key?.fromMe || u?.update?.status !== WAMessageStatus.ERROR) continue;
    const code = u.update.messageStubParameters?.[0] ?? null;
    const recent = await countSendError(ctx.sessionId);
    console.warn(`[WhatsApp:${ctx.sessionId}] erro no ack de envio (código ${code ?? '?'}; ${recent} em 10 min)`);
    if (shouldRestrictOnAckError(code, recent)) {
      await restrictSession(ctx.tenantId, ctx.dbSessionId, ctx.sessionId, String(code ?? 'SEND_ERRORS'));
      return;
    }
  }
}

/** Pausa IA, saudação, avisos e campanhas do número por 24 h e avisa o painel. */
export async function restrictSession(tenantId: string, dbSessionId: string, sessionId: string, code: string) {
  const current = await getRestrictedUntil(sessionId).catch(() => null);
  if (current) return current; // já pausado: não estende a cada erro
  const until = new Date(Date.now() + RESTRICTION_PAUSE_MS);
  await markSessionRestricted(sessionId, until);
  await prisma.whatsAppSession.update({ where: { id: dbSessionId }, data: { restrictedUntil: until } }).catch(() => {});
  const message = DISCONNECT_REASON_TEXT.RESTRICTED;
  console.warn(`[WhatsApp:${sessionId}] número limitado pelo WhatsApp (código ${code}) — automações pausadas até ${until.toISOString()}`);
  emitToTenant(tenantId, 'whatsapp:restricted', { sessionId: dbSessionId, code, restrictedUntil: until, message });
  emitStatus(tenantId, { sessionId: dbSessionId, status: 'CONNECTED', reason: 'RESTRICTED', restrictedUntil: until, message });
  emitWebhookEvent(tenantId, 'whatsapp.disconnected', { sessionId: dbSessionId, reason: 'RESTRICTED', code, restrictedUntil: until });
  return until;
}

/** Envio automático bloqueado pela restrição temporária do número (não repetir). */
export class SessionRestrictedError extends Error {
  readonly restricted = true;
  constructor(readonly until: Date) {
    super(`Envios automáticos pausados até ${until.toISOString()}: o WhatsApp limitou temporariamente este número`);
  }
}

// ─── Envio (ritmo humano, um por vez por número) ────────────────────────────

export type OutboundPayload =
  | { kind: 'text'; text: string }
  | { kind: 'audio'; path: string }
  | {
      kind: 'media';
      mediaType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';
      path: string;
      mimetype?: string;
      fileName?: string;
      caption?: string;
    };

/** Erro DEPOIS de chamar o WhatsApp: a mensagem pode ter saído — não repetir. */
export class MaybeSentError extends Error {
  readonly maybeSent = true;
}

function assertInsideUploads(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const rel = path.relative(getUploadRoot(), absolutePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new ForbiddenError('Caminho de arquivo inválido');
  }
  return absolutePath;
}

/** Conteúdo do Baileys para cada tipo de envio. */
export function buildOutboundContent(payload: OutboundPayload): AnyMessageContent {
  if (payload.kind === 'text') return { text: payload.text };
  if (payload.kind === 'audio') {
    const file = assertInsideUploads(payload.path);
    const isOpus = /\.(ogg|opus)$/i.test(file);
    // PTT (mensagem de voz) só com OGG/Opus; MP3 vai como áudio comum
    return isOpus
      ? { audio: { url: file }, mimetype: 'audio/ogg; codecs=opus', ptt: true }
      : { audio: { url: file }, mimetype: 'audio/mpeg', ptt: false };
  }
  const file = assertInsideUploads(payload.path);
  switch (payload.mediaType) {
    case 'IMAGE':
      return { image: { url: file }, caption: payload.caption || undefined, mimetype: payload.mimetype };
    case 'VIDEO':
      return { video: { url: file }, caption: payload.caption || undefined, mimetype: payload.mimetype };
    case 'AUDIO':
      return { audio: { url: file }, mimetype: payload.mimetype || 'audio/mpeg', ptt: false };
    default:
      return {
        document: { url: file },
        mimetype: payload.mimetype || 'application/octet-stream',
        fileName: payload.fileName || path.basename(file),
        caption: payload.caption || undefined,
      };
  }
}

function rememberSentId(id: string) {
  sentIds.add(id);
  if (sentIds.size > SENT_IDS_CAP) {
    const oldest = sentIds.values().next().value;
    if (oldest !== undefined) sentIds.delete(oldest);
  }
}

/**
 * Envia como uma pessoa: um envio por vez por número, "visto" na última mensagem do cliente,
 * "digitando..." proporcional ao texto, pausa e só então a mensagem. Mín. 1,2 s entre envios.
 * @param opts.idempotencyKey impede reenviar a mesma mensagem (retry/reinício)
 */
export async function sendHumanized(
  sessionId: string,
  jid: string,
  payload: OutboundPayload,
  opts: { idempotencyKey?: string; typing?: boolean; automatic?: boolean } = {},
): Promise<{ skipped: boolean; id?: string }> {
  return sendSerializer.run(sessionId, async () => {
    const sock = activeSockets.get(sessionId);
    if (!sock) throw new NotFoundError('Sessão WhatsApp', sessionId);

    // Número limitado pelo WhatsApp: nada automático sai (só o operador humano)
    if (opts.automatic) {
      const until = await getRestrictedUntil(sessionId);
      if (until) throw new SessionRestrictedError(until);
    }

    // "Visto" na última mensagem do cliente (se ainda não lida)
    const readKey = `${sessionId}|${jid}`;
    const unread = pendingReadKeys.get(readKey);
    if (unread) {
      pendingReadKeys.delete(readKey);
      try { await sock.readMessages([unread]); } catch { /* não crítico */ }
    }

    if (opts.typing !== false) {
      try { await sock.presenceSubscribe(jid); } catch { /* não crítico */ }
      try { await sock.sendPresenceUpdate(payload.kind === 'audio' ? 'recording' : 'composing', jid); } catch { /* idem */ }
      const len = payload.kind === 'text' ? payload.text.length : 80;
      await sleep(typingDelayMs(len));
      try { await sock.sendPresenceUpdate('paused', jid); } catch { /* idem */ }
    }

    // O socket pode ter caído durante a espera: ainda não enviou, pode tentar de novo depois
    const current = activeSockets.get(sessionId);
    if (!current) throw new NotFoundError('Sessão WhatsApp', sessionId);

    if (opts.idempotencyKey && !(await claimOnce(`wa:out:${opts.idempotencyKey}`, DAY_SEC))) {
      return { skipped: true };
    }

    const content = buildOutboundContent(payload);
    const messageId = generateMessageIDV2(current.user?.id);
    rememberSentId(messageId);

    let sent: any;
    try {
      sent = await current.sendMessage(jid, content, { messageId });
    } catch (err: any) {
      throw new MaybeSentError(err?.message || 'Falha ao enviar');
    }

    const id: string = sent?.key?.id || messageId;
    rememberSentId(id);
    if (sent?.message) {
      try {
        const encoded = Buffer.from(proto.Message.encode(sent.message).finish()).toString('base64');
        await rememberSentMessage(sessionId, id, encoded);
      } catch { /* não crítico */ }
    }
    return { skipped: false, id };
  });
}

/**
 * Envio de campanha: confere se o número existe no WhatsApp (onWhatsApp) e envia pelo
 * mesmo serializador por número (com "digitando...").
 */
export async function sendCampaignText(
  sessionId: string,
  phone: string,
  text: string,
  idempotencyKey: string,
): Promise<{ exists: boolean; skipped?: boolean; id?: string; jid?: string }> {
  const sock = activeSockets.get(sessionId);
  if (!sock) throw new NotFoundError('Sessão WhatsApp', sessionId);
  // Antes até do onWhatsApp: número limitado não consulta nem envia
  const until = await getRestrictedUntil(sessionId);
  if (until) throw new SessionRestrictedError(until);
  const candidate = toWhatsAppJid(phone);
  if (candidate.endsWith('@lid')) return { exists: false };
  let jid = candidate;
  try {
    const [result] = (await sock.onWhatsApp(candidate)) || [];
    if (!result?.exists) return { exists: false };
    jid = result.jid || candidate;
  } catch (err: any) {
    throw new Error(`Não foi possível verificar o número: ${err?.message || 'erro'}`);
  }
  const sent = await sendHumanized(sessionId, jid, { kind: 'text', text }, { idempotencyKey, automatic: true });
  return { exists: true, jid, ...sent };
}

export interface ConversationRoute {
  /** sessionId do Baileys (nome da pasta), não o id do banco */
  sessionId: string;
  jid: string;
}

/**
 * Por qual número e para qual JID responder a conversa — de forma robusta:
 * sessão da conversa → sessão da última mensagem do cliente → sessão do ticket → 1ª conectada;
 * JID da última mensagem do cliente → telefone do contato → LID do contato.
 */
export async function resolveConversationRoute(tenantId: string, conversationId: string): Promise<ConversationRoute | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: {
      channel: true,
      contactPhone: true,
      contactId: true,
      whatsappSession: { select: { sessionId: true } },
      ticket: { select: { whatsappSessionId: true } },
    },
  });
  if (!conversation || conversation.channel !== 'WHATSAPP') return null;

  const lastUser = await prisma.message.findFirst({
    where: { conversationId, role: 'USER' },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });
  const meta = (lastUser?.metadata ?? {}) as Record<string, any>;

  let sessionId: string | null = conversation.whatsappSession?.sessionId ?? meta.sessionId ?? null;
  if (!sessionId && conversation.ticket?.whatsappSessionId) {
    const s = await prisma.whatsAppSession.findFirst({
      where: { id: conversation.ticket.whatsappSessionId, tenantId },
      select: { sessionId: true },
    });
    sessionId = s?.sessionId ?? null;
  }
  if (!sessionId) {
    const s = await prisma.whatsAppSession.findFirst({
      where: { tenantId, status: 'CONNECTED' },
      orderBy: { createdAt: 'asc' },
      select: { sessionId: true },
    });
    sessionId = s?.sessionId ?? null;
  }

  let jid: string | null = typeof meta.jid === 'string' && meta.jid ? meta.jid : null;
  if (!jid && conversation.contactPhone) jid = toWhatsAppJid(conversation.contactPhone);
  if (!jid && conversation.contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: conversation.contactId, tenantId }, select: { lid: true } });
    jid = contact?.lid ?? null;
  }

  return sessionId && jid ? { sessionId, jid } : null;
}

/** Grava a mensagem automática (saudação, opt-out, aviso) na conversa e enfileira o envio. */
export async function queueAutomatedMessage(params: {
  tenantId: string;
  conversationId: string;
  sessionId: string;
  jid: string;
  content: string;
  kind: 'greeting' | 'opt-out' | 'offhours';
}) {
  const message = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      role: 'ASSISTANT',
      content: params.content,
      metadata: { automatic: params.kind, sessionId: params.sessionId, jid: params.jid, status: 'queued' },
    },
  });
  emitMessage(params.tenantId, params.conversationId, message);
  await whatsappOutboundQueue.add('send', {
    sessionId: params.sessionId,
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    jid: params.jid,
    content: params.content,
    messageId: message.id,
    automatic: true,
  }, { jobId: `out-${message.id}` });
  return message;
}

// ─── Gestão das sessões ─────────────────────────────────────────────────────

export async function reconnectSession(tenantId: string, sessionId: string) {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: sessionId, tenantId },
  });
  if (!session) throw new NotFoundError('Sessão WhatsApp', sessionId);

  await ensureAuthRoot();
  const authDir = path.join(AUTH_DIR, session.sessionId);
  await ensureAuthDir(authDir);

  // Encerra o socket anterior e qualquer reconexão pendente (nunca duas conexões)
  stopSession(session.sessionId);

  await prisma.whatsAppSession.update({
    where: { id: sessionId },
    data: { status: 'CONNECTING' },
  });

  startBaileysSession(tenantId, sessionId, session.sessionId, authDir).catch(() => {});

  emitStatus(tenantId, { sessionId, status: 'CONNECTING' });

  return prisma.whatsAppSession.findFirst({ where: { id: sessionId } });
}

export async function disconnectSession(tenantId: string, sessionId: string) {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: sessionId, tenantId },
  });
  if (!session) throw new NotFoundError('Sessão WhatsApp', sessionId);

  stopSession(session.sessionId);

  const updated = await prisma.whatsAppSession.update({
    where: { id: sessionId },
    data: { status: 'DISCONNECTED' },
  });

  emitStatus(tenantId, { sessionId: session.id, status: 'DISCONNECTED' });
  emitWebhookEvent(tenantId, 'whatsapp.disconnected', { sessionId: session.id, reason: 'MANUAL' });

  return updated;
}

export async function getSessionStatus(tenantId: string, sessionId: string) {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: sessionId, tenantId },
  });
  if (!session) throw new NotFoundError('Sessão', sessionId);

  return session;
}

export async function deleteSession(tenantId: string, sessionId: string) {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: sessionId, tenantId },
  });
  if (!session) throw new NotFoundError('Sessão WhatsApp', sessionId);

  const sock = activeSockets.get(session.sessionId);
  stopSession(session.sessionId);
  // Desvincula o aparelho no celular (senão fica "WhatsApp Web" pendurado)
  if (sock) {
    try {
      await Promise.race([sock.logout('Sessão excluída'), sleep(5000)]);
    } catch { /* já desconectado */ }
  }
  retryCounterCaches.delete(session.sessionId);

  const authDir = path.join(AUTH_DIR, session.sessionId);
  await fs.rm(authDir, { recursive: true, force: true }).catch(() => {});

  await prisma.whatsAppSession.delete({ where: { id: sessionId } });

  emitStatus(tenantId, { sessionId: session.id, status: 'DELETED' });
}

/**
 * Boot: reconecta só sessões que estavam conectadas (ou em reconexão) E têm login salvo,
 * uma por vez, com 3–7 s entre elas (não abrir várias conexões de uma vez).
 * Não bloqueia o boot: devolve quantas serão reconectadas.
 */
export async function reconnectAllSessions(random: () => number = Math.random) {
  await ensureAuthRoot();
  const sessions = await prisma.whatsAppSession.findMany({
    where: { status: { in: ['CONNECTED', 'CONNECTING'] } },
    orderBy: { lastConnectedAt: 'desc' },
  });

  const eligible: typeof sessions = [];
  for (const session of sessions) {
    const authDir = path.join(AUTH_DIR, session.sessionId);
    if (await hasRegisteredCreds(authDir)) {
      eligible.push(session);
    } else {
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { status: 'DISCONNECTED', qrCode: null },
      }).catch(() => {});
    }
  }

  void (async () => {
    for (let i = 0; i < eligible.length; i++) {
      if (i > 0) await sleep(3000 + Math.round(random() * 4000));
      const s = eligible[i];
      await startBaileysSession(s.tenantId, s.id, s.sessionId, path.join(AUTH_DIR, s.sessionId))
        .catch((err) => console.error(`Falha ao reconectar ${s.sessionId}:`, err?.message));
    }
  })();

  return eligible.length;
}

/**
 * Remove sessões CONNECTING/DISCONNECTED sem pasta de credenciais.
 * Com tenantId: só daquele tenant (usado ao conectar). Sem: todas (boot do servidor).
 */
export async function cleanupOrphanSessions(tenantId?: string) {
  await ensureAuthRoot();
  const sessions = await prisma.whatsAppSession.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status: { in: ['CONNECTING', 'DISCONNECTED'] },
    },
  });

  let cleaned = 0;
  for (const session of sessions) {
    // Sessão com socket/reconexão em andamento neste processo (ex.: aguardando QR) não é órfã
    if (
      activeSockets.has(session.sessionId) ||
      reconnectTimers.has(session.sessionId) ||
      starting.has(session.sessionId)
    ) continue;
    const authDir = path.join(AUTH_DIR, session.sessionId);
    try {
      await fs.access(authDir);
      // CONNECTING parado: no boot, sessão com login salvo será reconectada (reconnectAllSessions)
      if (session.status === 'CONNECTING') {
        const keepForBoot = !tenantId && (await hasRegisteredCreds(authDir));
        if (!keepForBoot) {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { status: 'DISCONNECTED' },
          });
        }
      }
    } catch {
      // Auth dir doesn't exist - delete orphaned session
      await prisma.whatsAppSession.delete({
        where: { id: session.id },
      }).catch(() => {});
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} orphaned WhatsApp sessions`);
  }

  return cleaned;
}
