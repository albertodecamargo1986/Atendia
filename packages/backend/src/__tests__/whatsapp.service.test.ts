/**
 * whatsapp.service — proteções anti-banimento e fluxo de mensagens, com um socket do
 * Baileys falso (EventEmitter). Nada de rede: prisma, Redis, filas e serviços são mocks.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createFakeRedis } from './helpers/fake-redis.js';

const h = vi.hoisted(() => {
  process.env.SESSION_ENCRYPTION_KEY = 'x'.repeat(40);
  // (sem imports aqui: vi.hoisted roda antes deles)
  const tmp = (process.env.TEMP || process.env.TMPDIR || '/tmp').split('\\').join('/');
  const base = `${tmp}/atendia-wa-test-${process.pid}-${Date.now()}`;
  return {
    base,
    authDir: `${base}/auth`,
    uploadDir: `${base}/uploads`,
    fakeRedis: { current: null as any },
    sockets: [] as any[],
    creds: { me: { id: '5511999990000:1@s.whatsapp.net' } } as any,
    emitted: [] as Array<{ room: string; event: string; payload: any }>,
    msgCounter: 0,
    genId: 0,
  };
});

function createFakeSock() {
  const ev = new EventEmitter();
  let ended = false;
  const sock: any = {
    ev,
    user: { id: '5511999990000:1@s.whatsapp.net' },
    end: vi.fn(() => { ended = true; }),
    // Como no Baileys: logout depois de end() falha (conexão já fechada) e o aparelho fica vinculado
    logout: vi.fn(async () => {
      if (ended) {
        sock.logoutFailed = true;
        throw new Error('Connection Closed');
      }
      sock.loggedOut = true;
    }),
    readMessages: vi.fn(async () => {}),
    presenceSubscribe: vi.fn(async () => {}),
    sendPresenceUpdate: vi.fn(async () => {}),
    sendMessage: vi.fn(async (_jid: string, _content: any, opts: any) => ({
      key: { id: opts?.messageId, fromMe: true },
      message: { conversation: 'ok' },
    })),
    onWhatsApp: vi.fn(async (jid: string) => [{ jid, exists: true }]),
    updateMediaMessage: vi.fn(),
  };
  return sock;
}

vi.mock('@whiskeysockets/baileys', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    default: vi.fn(() => {
      const s = createFakeSock();
      h.sockets.push(s);
      return s;
    }),
    useMultiFileAuthState: vi.fn(async () => ({ state: { creds: h.creds, keys: {} }, saveCreds: vi.fn() })),
    fetchLatestBaileysVersion: vi.fn(async () => ({ version: [2, 3000, 1043857760], isLatest: true })),
    makeCacheableSignalKeyStore: vi.fn((k: any) => k),
    generateMessageIDV2: vi.fn(() => `GEN${++h.genId}`),
  };
});

vi.mock('../config/index.js', () => ({
  getWhatsAppAuthDir: () => h.authDir,
  getUploadRoot: () => h.uploadDir,
  getConfig: () => ({ SMTP_HOST: 'smtp.exemplo.com' }),
}));

vi.mock('../lib/redis.js', () => ({
  default: new Proxy({}, { get: (_t, prop) => (h.fakeRedis.current as any)[prop] }),
}));

const { mockPrisma, mocks } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      whatsAppSession: {
        findFirst: fn(), findUnique: fn(), findMany: fn(), update: fn(), updateMany: fn(),
        create: fn(), count: fn(), delete: fn(),
      },
      tenant: { findUnique: fn() },
      agent: { findFirst: fn() },
      contact: { findFirst: fn(), update: fn() },
      conversation: { findFirst: fn(), update: fn(), create: fn() },
      message: { create: fn(), findFirst: fn() },
      ticket: { update: fn() },
      user: { findMany: fn() },
      campaign: { findMany: fn(), updateMany: fn() },
      campaignContact: { findMany: fn() },
    },
    mocks: {
      offhoursAdd: vi.fn(),
      outboundAdd: vi.fn(),
      transcriptionAdd: vi.fn(),
      isWithinBusinessHours: vi.fn(),
      findOrCreateContact: vi.fn(),
      findOrCreateTicket: vi.fn(),
      dispatchTicket: vi.fn(),
      getQueueForWhatsapp: vi.fn(),
      downloadWhatsAppMedia: vi.fn(),
      emitWebhookEvent: vi.fn(),
      scheduleAiResponse: vi.fn(),
      sendEmail: vi.fn(),
      recordCampaignOutcome: vi.fn(),
    },
  };
});

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/socket.js', () => ({
  getIO: () => ({ to: (room: string) => ({ emit: (event: string, payload: any) => h.emitted.push({ room, event, payload }) }) }),
}));
vi.mock('../workers/queues.js', () => ({
  offhoursMessageQueue: { add: mocks.offhoursAdd },
  whatsappOutboundQueue: { add: mocks.outboundAdd },
  audioTranscriptionQueue: { add: mocks.transcriptionAdd },
}));
vi.mock('../services/business-hours.service.js', () => ({ isWithinBusinessHours: mocks.isWithinBusinessHours }));
vi.mock('../services/contact.service.js', () => ({ findOrCreateContact: mocks.findOrCreateContact }));
vi.mock('../services/ticket.service.js', () => ({ findOrCreateTicket: mocks.findOrCreateTicket }));
vi.mock('../services/ticket.dispatcher.js', () => ({ dispatchTicket: mocks.dispatchTicket }));
vi.mock('../services/queue.service.js', () => ({ getQueueForWhatsapp: mocks.getQueueForWhatsapp }));
vi.mock('../services/voice.service.js', () => ({
  downloadWhatsAppMedia: mocks.downloadWhatsAppMedia,
  MAX_INCOMING_MEDIA_BYTES: 16 * 1024 * 1024,
}));
vi.mock('../services/webhook.service.js', () => ({ emitWebhookEvent: mocks.emitWebhookEvent }));
vi.mock('../lib/ai-schedule.js', () => ({ scheduleAiResponse: mocks.scheduleAiResponse, AI_DEBOUNCE_MS: 6000 }));
vi.mock('../lib/email.js', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('../services/campaign.service.js', () => ({
  campaignTokenKey: (id: string) => `campaign:token:${id}`,
  recordCampaignOutcome: mocks.recordCampaignOutcome,
}));

import makeWASocket, { fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import * as wa from '../services/whatsapp.service.js';
import { OPT_OUT_REPLY } from '../lib/opt-out.js';
import { _resetRestrictionCache } from '../lib/wa-guards.js';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';

const TENANT = 't1';
const flush = async (n = 60) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};
/** Espera (com I/O real) até a condição valer — ou desiste após ~2000 voltas do event loop. */
const waitUntil = async (cond: () => boolean) => {
  for (let i = 0; i < 2000 && !cond(); i++) await new Promise((r) => setImmediate(r));
};
const sockets = () => (makeWASocket as any).mock.calls.length;
const close = (sock: any, code: number) =>
  sock.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: code } } } });
const statusUpdates = () => mockPrisma.whatsAppSession.update.mock.calls.map((c: any[]) => c[0].data.status).filter(Boolean);

function writeCreds(sessionId: string, registered = true) {
  const dir = path.join(h.authDir, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'creds.json'), JSON.stringify(registered ? { me: { id: '55119@s.whatsapp.net' } } : {}));
  return dir;
}

async function start(sessionId: string, dbId = `db-${sessionId}`) {
  await wa.startBaileysSession(TENANT, dbId, sessionId, path.join(h.authDir, sessionId));
  return h.sockets[h.sockets.length - 1];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-05T14:00:00Z'));
  h.fakeRedis.current = createFakeRedis();
  h.emitted.length = 0;
  h.creds = { me: { id: '5511999990000:1@s.whatsapp.net' } };
  vi.clearAllMocks();
  for (const m of Object.values(mockPrisma)) for (const f of Object.values(m)) (f as any).mockResolvedValue({});
  mockPrisma.whatsAppSession.findMany.mockResolvedValue([]);
  mockPrisma.message.create.mockImplementation(async ({ data }: any) => ({ id: `m${++h.msgCounter}`, ...data }));
  mockPrisma.message.findFirst.mockResolvedValue(null);
  mockPrisma.contact.findFirst.mockResolvedValue(null);
  mockPrisma.user.findMany.mockResolvedValue([{ email: 'dono@empresa.com' }]);
  mockPrisma.campaign.findMany.mockResolvedValue([]);
  mockPrisma.campaignContact.findMany.mockResolvedValue([]);
  mockPrisma.whatsAppSession.findUnique.mockResolvedValue(null);
  _resetRestrictionCache();
  wa._resetAutoLimiter();
});

afterAll(() => {
  fs.rmSync(h.base, { recursive: true, force: true });
});

afterEach(async () => {
  // Nada "em voo" vaza para o próximo teste
  await waitUntil(() => wa.getConnectionDebugState().starting.length === 0);
  await flush();
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('socket único — sem fantasmas', () => {
  it('connect cria 1 socket; reconnect encerra o antigo (listeners removidos) antes de criar outro', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT, maxWhatsapp: 5 });
    mockPrisma.whatsAppSession.count.mockResolvedValue(0);
    mockPrisma.whatsAppSession.create.mockResolvedValue({ id: 'db-A', sessionId: 'sess-A' });
    await wa.connectSession(TENANT, { sessionId: 'sess-A' });
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    const first = h.sockets.at(-1);

    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'db-A', sessionId: 'sess-A', tenantId: TENANT });
    await wa.reconnectSession(TENANT, 'db-A');
    await waitUntil(() => sockets() >= 2);
    expect(makeWASocket).toHaveBeenCalledTimes(2);
    expect(first.end).toHaveBeenCalled();
    expect(first.ev.listenerCount('connection.update')).toBe(0);
    expect(first.ev.listenerCount('messages.upsert')).toBe(0);
    expect(wa.getConnectionDebugState().sockets.filter((s) => s === 'sess-A')).toHaveLength(1);

    // O socket antigo "fecha" depois: nada acontece
    close(first, 428);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('starts simultâneos da mesma sessão criam UM socket só', async () => {
    await Promise.all([start('sess-par'), start('sess-par'), start('sess-par')]);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('disconnect: encerra, não reconecta e não deixa timer de reconexão', async () => {
    const sock = await start('sess-D');
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'db-sess-D', sessionId: 'sess-D', tenantId: TENANT });
    await wa.disconnectSession(TENANT, 'db-sess-D');
    expect(sock.end).toHaveBeenCalled();
    close(sock, 428); // mesmo que o Baileys emita "close" depois
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    const state = wa.getConnectionDebugState();
    expect(state.sockets).not.toContain('sess-D');
    expect(state.reconnectTimers).not.toContain('sess-D');
  });

  it('close durante backoff + disconnect: o timer pendente é cancelado', async () => {
    const sock = await start('sess-T');
    close(sock, 428); // agenda reconexão (backoff)
    await flush();
    expect(wa.getConnectionDebugState().reconnectTimers).toContain('sess-T');
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'db-sess-T', sessionId: 'sess-T', tenantId: TENANT });
    await wa.disconnectSession(TENANT, 'db-sess-T');
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('delete: desvincula (logout), apaga credenciais e não reconecta', async () => {
    writeCreds('sess-X');
    const sock = await start('sess-X');
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'db-sess-X', sessionId: 'sess-X', tenantId: TENANT });
    await wa.deleteSession(TENANT, 'db-sess-X');
    expect(sock.logout).toHaveBeenCalled();
    expect(sock.end).toHaveBeenCalled();
    expect(fs.existsSync(path.join(h.authDir, 'sess-X'))).toBe(false);
    close(sock, 428);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('reação a cada código de desconexão', () => {
  it('401: apaga credenciais, DISCONNECTED, não reconecta', async () => {
    const dir = writeCreds('c401');
    const sock = await start('c401');
    close(sock, 401);
    await waitUntil(() => statusUpdates().includes('DISCONNECTED'));
    expect(fs.existsSync(path.join(dir, 'creds.json'))).toBe(false);
    expect(statusUpdates()).toContain('DISCONNECTED');
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('440: conectado em outro lugar — não reconecta', async () => {
    const sock = await start('c440');
    close(sock, 440);
    await flush();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    expect(h.emitted.some((e) => e.event === 'whatsapp:status' && e.payload.reason === 'CONNECTION_REPLACED')).toBe(true);
  });

  it('403: BANNED, para e avisa o painel', async () => {
    const sock = await start('c403');
    close(sock, 403);
    await flush();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    expect(statusUpdates()).toContain('BANNED');
    expect(h.emitted.some((e) => e.event === 'whatsapp:banned')).toBe(true);
  });

  it('515: reconecta 1x em ~1 s; um 2º 515 sem abrir vira backoff (sem loop rápido)', async () => {
    const sock = await start('c515');
    close(sock, 515);
    await flush();
    await vi.advanceTimersByTimeAsync(1_000);
    await waitUntil(() => sockets() >= 2);
    expect(makeWASocket).toHaveBeenCalledTimes(2);
    close(h.sockets.at(-1), 515);
    await flush();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(makeWASocket).toHaveBeenCalledTimes(2); // backoff ≥ 4 s
    await vi.advanceTimersByTimeAsync(4_000);
    await waitUntil(() => sockets() >= 3);
    expect(makeWASocket).toHaveBeenCalledTimes(3);
  });

  it('queda transitória (428): backoff de 4–6 s na 1ª tentativa', async () => {
    const sock = await start('c428');
    close(sock, 428);
    await flush();
    await vi.advanceTimersByTimeAsync(3_900);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_200);
    await waitUntil(() => sockets() >= 2);
    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('sessão sem login (QR não lido) que fecha: NÃO gera QR novo sozinha', async () => {
    h.creds = {};
    const sock = await start('cqr');
    close(sock, 408);
    await flush();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('405: busca a versão atual e tenta 1x; se repetir, para (sem loop)', async () => {
    const sock = await start('c405');
    const fetchCalls = (fetchLatestBaileysVersion as any).mock.calls.length;
    close(sock, 405);
    await flush();
    await vi.advanceTimersByTimeAsync(2_000);
    await waitUntil(() => sockets() >= 2);
    expect(makeWASocket).toHaveBeenCalledTimes(2);
    expect((fetchLatestBaileysVersion as any).mock.calls.length).toBe(fetchCalls + 1); // versão rebuscada
    close(h.sockets.at(-1), 405);
    await flush();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(makeWASocket).toHaveBeenCalledTimes(2);
    expect(h.emitted.some((e) => e.payload?.reason === 'CLIENT_TOO_OLD')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('versão do WhatsApp Web', () => {
  it('passa `version` e configuração explícita segura para o makeWASocket', async () => {
    await start('cfg');
    const cfg = (makeWASocket as any).mock.calls[0][0];
    expect(cfg.version).toEqual(expect.any(Array));
    expect(cfg.markOnlineOnConnect).toBe(false);
    expect(cfg.syncFullHistory).toBe(false);
    expect(cfg.browser[1]).toBe('Chrome');
    expect(cfg.browser[0]).toMatch(/ubuntu/i);
    expect(cfg.keepAliveIntervalMs).toBe(30_000);
    expect(cfg.generateHighQualityLinkPreview).toBe(false);
    expect(cfg.msgRetryCounterCache).toBeDefined();
    expect(typeof cfg.getMessage).toBe('function');
    for (const jid of ['123@g.us', 'status@broadcast', '1@newsletter', '1@broadcast']) expect(cfg.shouldIgnoreJid(jid)).toBe(true);
    expect(cfg.shouldIgnoreJid('5511988887777@s.whatsapp.net')).toBe(false);
  });

  it('busca falhou: usa o último valor bom (Redis) e loga aviso — não cai calado na embutida', async () => {
    (fetchLatestBaileysVersion as any).mockResolvedValueOnce({ version: [2, 3000, 1100000000], isLatest: true });
    expect(await wa.getWaVersion(true)).toEqual([2, 3000, 1100000000]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (fetchLatestBaileysVersion as any).mockResolvedValueOnce({ version: [2, 3000, 1023223821], isLatest: false, error: new Error('rede') });
    expect(await wa.getWaVersion(true)).toEqual([2, 3000, 1100000000]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('último valor bom'));
    warn.mockRestore();
  });

  it('cache de 24 h: não busca a cada conexão', async () => {
    (fetchLatestBaileysVersion as any).mockResolvedValueOnce({ version: [2, 3000, 1200000000], isLatest: true });
    await wa.getWaVersion(true);
    const n = (fetchLatestBaileysVersion as any).mock.calls.length;
    await wa.getWaVersion();
    await wa.getWaVersion();
    expect((fetchLatestBaileysVersion as any).mock.calls.length).toBe(n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('boot e mesmo número em outra sessão', () => {
  it('boot: só sessões com login salvo, uma por vez, 3–7 s entre elas', async () => {
    writeCreds('boot1');
    writeCreds('boot2');
    writeCreds('boot3', false);
    const bootList = [
      { id: 'b1', tenantId: TENANT, sessionId: 'boot1', status: 'CONNECTED' },
      { id: 'b2', tenantId: TENANT, sessionId: 'boot2', status: 'CONNECTING' },
      { id: 'b3', tenantId: TENANT, sessionId: 'boot3', status: 'CONNECTED' },
    ];
    mockPrisma.whatsAppSession.findMany.mockImplementation(async (a: any) => (a.where.restrictedUntil ? [] : bootList));
    const count = await wa.reconnectAllSessions(() => 0);
    expect(count).toBe(2);
    expect(mockPrisma.whatsAppSession.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'b3' }, data: expect.objectContaining({ status: 'DISCONNECTED' }) }));
    await waitUntil(() => sockets() >= 1);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_900);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await waitUntil(() => sockets() >= 2);
    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('mesmo número conectado em outra sessão da empresa: logout da antiga', async () => {
    const old = await start('same-old');
    const fresh = await start('same-new');
    mockPrisma.whatsAppSession.findMany.mockResolvedValueOnce([{ id: 'db-same-old', sessionId: 'same-old', tenantId: TENANT }]);
    fresh.ev.emit('connection.update', { connection: 'open' });
    await flush();
    expect(mockPrisma.whatsAppSession.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, phoneNumber: '5511999990000', id: { not: 'db-same-new' } },
    });
    expect(old.logout).toHaveBeenCalled();
    expect(old.end).toHaveBeenCalled();
    close(old, 401);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('envio humanizado', () => {
  it('ordem: presenceSubscribe → composing → espera → paused → sendMessage (com id gerado por nós)', async () => {
    const sock = await start('send1');
    const p = wa.sendHumanized('send1', '5511@s.whatsapp.net', { kind: 'text', text: 'Olá, tudo bem?' });
    await vi.advanceTimersByTimeAsync(20_000);
    const res = await p;
    expect(res.skipped).toBe(false);
    const order = [
      sock.presenceSubscribe.mock.invocationCallOrder[0],
      sock.sendPresenceUpdate.mock.invocationCallOrder[0],
      sock.sendPresenceUpdate.mock.invocationCallOrder[1],
      sock.sendMessage.mock.invocationCallOrder[0],
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(sock.sendPresenceUpdate.mock.calls[0][0]).toBe('composing');
    expect(sock.sendPresenceUpdate.mock.calls[1][0]).toBe('paused');
    expect(sock.sendMessage.mock.calls[0][2]).toEqual({ messageId: expect.stringMatching(/^GEN/) });
  });

  it('visto antes de responder: lê a última mensagem do cliente', async () => {
    const sock = await start('send-read');
    const ctx = { tenantId: TENANT, dbSessionId: 'db-send-read', sessionId: 'send-read', authDir: '', sock, state: { creds: h.creds } };
    setupIncoming();
    const msg = incoming('R1', 'oi');
    await wa.handleIncomingMessage(ctx as any, msg);
    const p = wa.sendHumanized('send-read', '5511988887777@s.whatsapp.net', { kind: 'text', text: 'Olá' });
    await vi.advanceTimersByTimeAsync(20_000);
    await p;
    expect(sock.readMessages).toHaveBeenCalledWith([msg.key]);
    expect(sock.readMessages.mock.invocationCallOrder[0]).toBeLessThan(sock.sendMessage.mock.invocationCallOrder[0]);
  });

  it('serializado por número: nunca 2 envios ao mesmo tempo e ≥ 1,2 s entre eles', async () => {
    const sock = await start('send2');
    let inFlight = 0;
    let max = 0;
    const sentAt: number[] = [];
    const composingAt: number[] = [];
    sock.sendPresenceUpdate.mockImplementation(async (type: string) => {
      if (type === 'composing') { inFlight++; max = Math.max(max, inFlight); composingAt.push(Date.now()); }
    });
    sock.sendMessage.mockImplementation(async (_j: string, _c: any, o: any) => {
      sentAt.push(Date.now());
      inFlight--;
      return { key: { id: o.messageId }, message: { conversation: 'x' } };
    });
    const all = Promise.all([1, 2, 3].map((i) => wa.sendHumanized('send2', `55${i}@s.whatsapp.net`, { kind: 'text', text: 'msg ' + i })));
    await vi.advanceTimersByTimeAsync(60_000);
    await all;
    expect(max).toBe(1);
    expect(composingAt[1] - sentAt[0]).toBeGreaterThanOrEqual(1_200);
    expect(composingAt[2] - sentAt[1]).toBeGreaterThanOrEqual(1_200);
  });

  it('idempotência: a mesma mensagem (messageId) nunca é enviada 2x', async () => {
    const sock = await start('send3');
    const p1 = wa.sendHumanized('send3', 'a@s.whatsapp.net', { kind: 'text', text: 'oi' }, { idempotencyKey: 'msg-1' });
    await vi.advanceTimersByTimeAsync(20_000);
    await p1;
    const p2 = wa.sendHumanized('send3', 'a@s.whatsapp.net', { kind: 'text', text: 'oi' }, { idempotencyKey: 'msg-1' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await p2).toEqual({ skipped: true });
    expect(sock.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('erro ao chamar o WhatsApp vira MaybeSentError (o worker não repete)', async () => {
    const sock = await start('send4');
    sock.sendMessage.mockRejectedValueOnce(new Error('timeout'));
    const p = wa.sendHumanized('send4', 'a@s.whatsapp.net', { kind: 'text', text: 'oi' });
    const assertion = expect(p).rejects.toBeInstanceOf(wa.MaybeSentError);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  it('áudio TTS .ogg vai como PTT opus; .mp3 vai como áudio comum', () => {
    fs.mkdirSync(h.uploadDir, { recursive: true });
    const ogg = wa.buildOutboundContent({ kind: 'audio', path: path.join(h.uploadDir, 't', 'audio', 'a.ogg') }) as any;
    expect(ogg).toMatchObject({ mimetype: 'audio/ogg; codecs=opus', ptt: true });
    const mp3 = wa.buildOutboundContent({ kind: 'audio', path: path.join(h.uploadDir, 't', 'audio', 'a.mp3') }) as any;
    expect(mp3).toMatchObject({ mimetype: 'audio/mpeg', ptt: false });
    expect(() => wa.buildOutboundContent({ kind: 'audio', path: path.join(os.tmpdir(), 'fora.ogg') })).toThrow();
  });

  it('documento do operador vai como mídia com nome e mimetype', () => {
    const doc = wa.buildOutboundContent({ kind: 'media', mediaType: 'DOCUMENT', path: path.join(h.uploadDir, 't', 'x.pdf'), fileName: 'contrato.pdf', mimetype: 'application/pdf' }) as any;
    expect(doc).toMatchObject({ fileName: 'contrato.pdf', mimetype: 'application/pdf' });
    expect(doc.document.url).toContain('x.pdf');
  });

  it('campanha: confere onWhatsApp e pula número inexistente', async () => {
    const sock = await start('camp1');
    sock.onWhatsApp.mockResolvedValueOnce([{ jid: '5511000@s.whatsapp.net', exists: false }]);
    expect(await wa.sendCampaignText('camp1', '5511000', 'oi', 'k1')).toEqual({ exists: false });
    expect(sock.sendMessage).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('restrição temporária (463) → pausa automações por 24 h', () => {
  it('ack de erro 463 pausa IA/saudação/campanha do número e avisa o painel; operador continua enviando', async () => {
    const sock = await start('r463');
    sock.ev.emit('messages.update', [{ key: { fromMe: true, id: 'X1', remoteJid: 'a@s.whatsapp.net' }, update: { status: 0, messageStubParameters: ['463'] } }]);
    await flush();
    expect(mockPrisma.whatsAppSession.update).toHaveBeenCalledWith({
      where: { id: 'db-r463' },
      data: expect.objectContaining({ restrictedUntil: expect.any(Date), restrictionIncidents: [expect.any(String)] }),
    });
    const ev = h.emitted.find((e) => e.event === 'whatsapp:restricted');
    expect(ev?.payload.message).toContain('envios automáticos pausados por 24h');

    const auto = wa.sendHumanized('r463', 'a@s.whatsapp.net', { kind: 'text', text: 'IA' }, { automatic: true });
    const assertion = expect(auto).rejects.toBeInstanceOf(wa.SessionRestrictedError);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    await expect(wa.sendCampaignText('r463', '5511988887777', 'promo', 'k2')).rejects.toBeInstanceOf(wa.SessionRestrictedError);
    expect(sock.onWhatsApp).not.toHaveBeenCalled();

    const manual = wa.sendHumanized('r463', 'a@s.whatsapp.net', { kind: 'text', text: 'operador' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await manual).skipped).toBe(false);

    // 24 h depois volta ao normal
    vi.setSystemTime(Date.now() + 24 * 3600_000 + 1000);
    const later = wa.sendHumanized('r463', 'a@s.whatsapp.net', { kind: 'text', text: 'IA' }, { automatic: true });
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await later).skipped).toBe(false);
  });

  it('3 erros de envio seguidos (sem 463) também pausam', async () => {
    const sock = await start('rerr');
    for (let i = 0; i < 2; i++) {
      sock.ev.emit('messages.update', [{ key: { fromMe: true, id: 'E' + i }, update: { status: 0, messageStubParameters: ['479'] } }]);
      await flush();
    }
    expect(h.emitted.some((e) => e.event === 'whatsapp:restricted')).toBe(false);
    sock.ev.emit('messages.update', [{ key: { fromMe: true, id: 'E3' }, update: { status: 0, messageStubParameters: ['479'] } }]);
    await flush();
    expect(h.emitted.some((e) => e.event === 'whatsapp:restricted')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
function setupIncoming(overrides: { conversation?: any; contact?: any; ticket?: any; queue?: any } = {}) {
  const conversation = overrides.conversation ?? {
    id: 'cv1', status: 'ACTIVE', agentId: 'ag1', agent: { isActive: true, name: 'Bot' },
    contactId: 'ct1', whatsappSessionId: 'db-in',
  };
  mockPrisma.conversation.findFirst.mockResolvedValue(conversation);
  mocks.findOrCreateContact.mockResolvedValue(overrides.contact ?? { id: 'ct1', optedOutAt: null });
  mocks.findOrCreateTicket.mockResolvedValue(overrides.ticket ?? { ticket: { id: 'tk1', queueId: 'q1', status: 'PENDING' }, created: false });
  mocks.getQueueForWhatsapp.mockResolvedValue(overrides.queue ?? { id: 'q1', greetingMessage: 'Bem-vindo!' });
  mocks.isWithinBusinessHours.mockResolvedValue(true);
  return conversation;
}

function incoming(id: string, text: string, extra: Record<string, any> = {}) {
  return {
    key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id },
    message: { conversation: text },
    pushName: 'Maria',
    messageTimestamp: Math.floor(Date.now() / 1000) - 5,
    ...extra,
  };
}

const ctxIn = () => ({ tenantId: TENANT, dbSessionId: 'db-in', sessionId: 'in', authDir: '', sock: createFakeSock(), state: { creds: h.creds } }) as any;
const greetingsQueued = () => mockPrisma.message.create.mock.calls.filter((c: any[]) => c[0].data.metadata?.automatic === 'greeting').length;

describe('mensagem recebida → fluxo', () => {
  it('agenda a IA com debounce (job pela mensagem que disparou)', async () => {
    setupIncoming();
    await wa.handleIncomingMessage(ctxIn(), incoming('A1', 'oi'));
    expect(mocks.scheduleAiResponse).toHaveBeenCalledWith({ tenantId: TENANT, conversationId: 'cv1', agentId: 'ag1', triggerMessageId: expect.any(String) }, 6000);
    // painel recebe a mensagem antes do ticket ser tratado
    const msgEvent = h.emitted.findIndex((e) => e.event === 'message:new');
    expect(msgEvent).toBeGreaterThanOrEqual(0);
    expect(mocks.findOrCreateTicket.mock.invocationCallOrder[0]).toBeGreaterThan(mockPrisma.message.create.mock.invocationCallOrder[0]);
  });

  it('dedupe: o mesmo id do WhatsApp só é processado 1x', async () => {
    setupIncoming();
    const ctx = ctxIn();
    await wa.handleIncomingMessage(ctx, incoming('D1', 'oi'));
    await wa.handleIncomingMessage(ctx, incoming('D1', 'oi'));
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleAiResponse).toHaveBeenCalledTimes(1);
  });

  it('mensagem antiga (> 10 min): grava, não dispara IA/saudação/aviso e fica "aguardando humano"', async () => {
    setupIncoming({ ticket: { ticket: { id: 'tk1', queueId: 'q1', status: 'PENDING' }, created: true } });
    await wa.handleIncomingMessage(ctxIn(), incoming('O1', 'oi', { messageTimestamp: Math.floor(Date.now() / 1000) - 3600 }));
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.message.create.mock.calls[0][0].data.metadata.late).toBe(true);
    expect(mockPrisma.message.create.mock.calls[1][0].data).toMatchObject({ role: 'SYSTEM', metadata: { awaitingHuman: true } });
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'cv1' }, data: { status: 'HUMAN_TAKEOVER' } });
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
    expect(mocks.outboundAdd).not.toHaveBeenCalled();
    expect(mocks.offhoursAdd).not.toHaveBeenCalled();
  });

  it("'append' (offline) e reenvio de placeholder (requestId): só gravam", async () => {
    setupIncoming();
    const ctx = ctxIn();
    const sock = await start('upsert-append');
    sock.ev.emit('messages.upsert', { type: 'append', messages: [incoming('AP1', 'SAIR')] });
    sock.ev.emit('messages.upsert', { type: 'notify', requestId: 'req', messages: [incoming('AP2', 'forjada?')] });
    await flush(20);
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.contact.update).toHaveBeenCalledWith({ where: { id: 'ct1' }, data: { optedOutAt: expect.any(Date) } });
    expect(mocks.outboundAdd).not.toHaveBeenCalled();
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
    void ctx;
  });

  it('saudação da fila: só para ticket CRIADO agora e no máx. 1x por conversa a cada 12 h', async () => {
    setupIncoming({ ticket: { ticket: { id: 'tk1', queueId: 'q1', status: 'PENDING' }, created: true } });
    const ctx = ctxIn();
    await wa.handleIncomingMessage(ctx, incoming('G1', 'oi'));
    await wa.handleIncomingMessage(ctx, incoming('G2', 'oi de novo'));
    expect(greetingsQueued()).toBe(1);
    expect(mocks.outboundAdd).toHaveBeenCalledWith('send', expect.objectContaining({ content: 'Bem-vindo!', automatic: true }), expect.any(Object));

    mocks.findOrCreateTicket.mockResolvedValue({ ticket: { id: 'tk1', queueId: 'q1', status: 'PENDING' }, created: false });
    vi.setSystemTime(Date.now() + 13 * 3600_000);
    await wa.handleIncomingMessage(ctx, incoming('G3', 'voltei'));
    expect(greetingsQueued()).toBe(1); // ticket existente: sem saudação
  });

  it('fora do horário: aviso 1x a cada 12 h, sem mudar o status da conversa, sem IA', async () => {
    setupIncoming();
    mocks.isWithinBusinessHours.mockResolvedValue(false);
    const ctx = ctxIn();
    await wa.handleIncomingMessage(ctx, incoming('F1', 'oi'));
    await wa.handleIncomingMessage(ctx, incoming('F2', 'alguém?'));
    expect(mocks.offhoursAdd).toHaveBeenCalledTimes(1);
    expect(mocks.offhoursAdd).toHaveBeenCalledWith('offhours', expect.objectContaining({ conversationId: 'cv1' }), { jobId: 'offhours-cv1' });
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
    const statusChanges = mockPrisma.conversation.update.mock.calls.filter((c: any[]) => c[0].data?.status);
    expect(statusChanges).toHaveLength(0);
    vi.setSystemTime(Date.now() + 12 * 3600_000 + 1000);
    await wa.handleIncomingMessage(ctx, incoming('F3', 'e agora?'));
    expect(mocks.offhoursAdd).toHaveBeenCalledTimes(2);
  });

  it('opt-out: marca o contato, responde UMA vez e a IA não responde', async () => {
    setupIncoming();
    const ctx = ctxIn();
    await wa.handleIncomingMessage(ctx, incoming('S1', 'SAIR'));
    expect(mockPrisma.contact.update).toHaveBeenCalledWith({ where: { id: 'ct1' }, data: { optedOutAt: expect.any(Date) } });
    expect(mocks.outboundAdd).toHaveBeenCalledWith('send', expect.objectContaining({ content: OPT_OUT_REPLY }), expect.any(Object));
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();

    mocks.findOrCreateContact.mockResolvedValue({ id: 'ct1', optedOutAt: new Date() });
    await wa.handleIncomingMessage(ctx, incoming('S2', 'parar'));
    expect(mocks.outboundAdd).toHaveBeenCalledTimes(1);
  });

  it('mesma mensagem idêntica repetida > 3x seguidas: a IA para de responder', async () => {
    setupIncoming();
    const ctx = ctxIn();
    for (let i = 1; i <= 5; i++) await wa.handleIncomingMessage(ctx, incoming('REP' + i, 'Menu'));
    expect(mocks.scheduleAiResponse).toHaveBeenCalledTimes(3);
  });

  it('conversa com humano (HUMAN_TAKEOVER): grava mas não chama a IA', async () => {
    setupIncoming({ conversation: { id: 'cv2', status: 'HUMAN_TAKEOVER', agentId: 'ag1', agent: { isActive: true, name: 'Bot' }, contactId: 'ct1', whatsappSessionId: 'db-in' } });
    await wa.handleIncomingMessage(ctxIn(), incoming('H1', 'oi'));
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
  });

  it('cliente volta após encerrar (< 2 h): conversa RESOLVED é reativada, não duplicada', async () => {
    setupIncoming();
    mockPrisma.conversation.findFirst
      .mockResolvedValueOnce(null) // nenhuma aberta
      .mockResolvedValueOnce({ id: 'cv-old', status: 'RESOLVED' });
    mockPrisma.conversation.update.mockResolvedValue({ id: 'cv-old', status: 'ACTIVE', agentId: 'ag1', agent: { isActive: true, name: 'Bot' } });
    await wa.handleIncomingMessage(ctxIn(), incoming('B1', 'voltei'));
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cv-old' }, data: expect.objectContaining({ status: 'ACTIVE' }) }));
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    expect(mocks.findOrCreateTicket).toHaveBeenCalledWith(TENANT, 'ct1', 'cv-old', 'db-in', 1, 'voltei', false);
  });

  it('LID: usa senderPn como telefone e guarda o LID no contato', async () => {
    setupIncoming();
    await wa.handleIncomingMessage(ctxIn(), {
      key: { remoteJid: '99887766@lid', senderPn: '5511977776666@s.whatsapp.net', fromMe: false, id: 'L1' },
      message: { conversation: 'oi' }, pushName: 'Lia', messageTimestamp: Math.floor(Date.now() / 1000),
    });
    expect(mocks.findOrCreateContact).toHaveBeenCalledWith(TENANT, '5511977776666', 'Lia', undefined, false, '99887766@lid');
  });

  it('grupos e status nunca entram', async () => {
    setupIncoming();
    await wa.handleIncomingMessage(ctxIn(), { ...incoming('GR1', 'oi'), key: { remoteJid: '123-456@g.us', id: 'GR1' } });
    await wa.handleIncomingMessage(ctxIn(), { ...incoming('ST1', 'oi'), key: { remoteJid: 'status@broadcast', id: 'ST1' } });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('áudio: transcrição vai para um job (fora do handler) e a IA é agendada depois', async () => {
    setupIncoming();
    fs.mkdirSync(path.join(h.uploadDir, TENANT, 'audio'), { recursive: true });
    mocks.downloadWhatsAppMedia.mockResolvedValue({ filePath: path.join(h.uploadDir, TENANT, 'audio', 'a.ogg'), fileName: 'a.ogg' });
    await wa.handleIncomingMessage(ctxIn(), { ...incoming('AU1', ''), message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', fileLength: 1000 } } });
    expect(mocks.transcriptionAdd).toHaveBeenCalledWith('transcribe', expect.objectContaining({ scheduleAi: true }), { jobId: expect.stringMatching(/^transcribe-/) });
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('mensagem enviada pelo celular do atendente', () => {
  it('grava como mensagem do atendente e pausa a IA (HUMAN_TAKEOVER) — sem resposta automática', async () => {
    setupIncoming();
    await wa.handleOwnPhoneMessage(ctxIn(), {
      key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: true, id: 'PH1' },
      message: { conversation: 'Oi, aqui é a Ana' }, messageTimestamp: Math.floor(Date.now() / 1000),
    });
    const created = mockPrisma.message.create.mock.calls.map((c: any[]) => c[0].data);
    expect(created[0]).toMatchObject({ role: 'ASSISTANT', content: 'Oi, aqui é a Ana', metadata: expect.objectContaining({ fromPhone: true }) });
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'cv1' }, data: { status: 'HUMAN_TAKEOVER' } });
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
  });

  it('eco de mensagem enviada pelo próprio sistema é ignorado', async () => {
    setupIncoming();
    const sock = await start('echo');
    const p = wa.sendHumanized('echo', '5511988887777@s.whatsapp.net', { kind: 'text', text: 'resposta da IA' });
    await vi.advanceTimersByTimeAsync(20_000);
    const { id } = await p;
    await wa.handleOwnPhoneMessage({ ...ctxIn(), sessionId: 'echo', sock }, {
      key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: true, id },
      message: { conversation: 'resposta da IA' }, messageTimestamp: Math.floor(Date.now() / 1000),
    });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Correções da auditoria independente
// ═════════════════════════════════════════════════════════════════════════════

describe('auditoria — logout com o socket ABERTO (sem aparelho fantasma)', () => {
  it('excluir: logout antes do end — o logout funciona e o aparelho é desvinculado', async () => {
    const sock = await start('del-order');
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'db-del-order', sessionId: 'del-order', tenantId: TENANT });
    await wa.deleteSession(TENANT, 'db-del-order');
    expect(sock.logout.mock.invocationCallOrder[0]).toBeLessThan(sock.end.mock.invocationCallOrder[0]);
    expect(sock.loggedOut).toBe(true);
    expect(sock.logoutFailed).toBeUndefined();
  });

  it('mesmo número em outra sessão: a antiga faz logout antes do end', async () => {
    const old = await start('order-old');
    const fresh = await start('order-new');
    mockPrisma.whatsAppSession.findMany.mockResolvedValueOnce([{ id: 'db-order-old', sessionId: 'order-old', tenantId: TENANT }]);
    fresh.ev.emit('connection.update', { connection: 'open' });
    await waitUntil(() => old.end.mock.calls.length > 0);
    expect(old.logout.mock.invocationCallOrder[0]).toBeLessThan(old.end.mock.invocationCallOrder[0]);
    expect(old.loggedOut).toBe(true);
    expect(old.logoutFailed).toBeUndefined();
  });
});

describe('auditoria — reconectar durante uma partida em voo', () => {
  it('reconnect não é "engolido": a partida antiga é descartada e uma nova cria o socket', async () => {
    let release: () => void = () => {};
    (useMultiFileAuthState as any).mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ state: { creds: h.creds, keys: {} }, saveCreds: vi.fn() });
    }));
    const dir = path.join(h.authDir, 'rc');
    const inFlight = wa.startBaileysSession(TENANT, 'db-rc', 'rc', dir, { fromTimer: true });
    await flush();
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'db-rc', sessionId: 'rc', tenantId: TENANT, status: 'DISCONNECTED', restrictedUntil: null });
    await wa.reconnectSession(TENANT, 'db-rc');
    release();
    await inFlight;
    await waitUntil(() => sockets() >= 1 && wa.getConnectionDebugState().starting.length === 0);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    expect(wa.getConnectionDebugState().sockets).toContain('rc');
  });

  it('reconectar: no máx. 1x por minuto; número bloqueado/limitado exige confirmação', async () => {
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'db-cool', sessionId: 'cool', tenantId: TENANT, status: 'DISCONNECTED', restrictedUntil: null });
    await wa.reconnectSession(TENANT, 'db-cool');
    await expect(wa.reconnectSession(TENANT, 'db-cool')).rejects.toThrow(/Aguarde/);
    vi.setSystemTime(Date.now() + 61_000);
    await expect(wa.reconnectSession(TENANT, 'db-cool')).resolves.toBeDefined();

    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'db-ban', sessionId: 'ban', tenantId: TENANT, status: 'BANNED', restrictedUntil: null });
    await expect(wa.reconnectSession(TENANT, 'db-ban')).rejects.toThrow(/bloqueado/);
    await expect(wa.reconnectSession(TENANT, 'db-ban', { confirm: true })).resolves.toBeDefined();

    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({
      id: 'db-lim', sessionId: 'lim', tenantId: TENANT, status: 'CONNECTED', restrictedUntil: new Date(Date.now() + 3600_000),
    });
    await expect(wa.reconnectSession(TENANT, 'db-lim')).rejects.toThrow(/limitou/);
  });
});

describe('auditoria — mensagens simultâneas do mesmo contato', () => {
  it('2 mensagens ao mesmo tempo → 1 conversa (processamento em fila por contato)', async () => {
    setupIncoming();
    let conv: any = null;
    mockPrisma.conversation.findFirst.mockImplementation(async (a: any) => (a.where.status === 'RESOLVED' ? null : conv));
    mockPrisma.agent.findFirst.mockResolvedValue({ id: 'ag1', isActive: true, name: 'Bot' });
    mockPrisma.conversation.create.mockImplementation(async () => {
      await new Promise((r) => setImmediate(r));
      conv = { id: 'cv-unica', status: 'ACTIVE', agentId: 'ag1', agent: { isActive: true, name: 'Bot' }, contactId: 'ct1', whatsappSessionId: 'db-in' };
      return conv;
    });
    const ctx = ctxIn();
    await Promise.all([wa.handleIncomingMessage(ctx, incoming('S1', 'oi')), wa.handleIncomingMessage(ctx, incoming('S2', 'tudo bem?'))]);
    expect(mockPrisma.conversation.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.message.create.mock.calls.every((c: any[]) => c[0].data.conversationId === 'cv-unica')).toBe(true);
  });
});

describe('auditoria — credenciais seguras no desligamento', () => {
  it('creds.json corrompido + backup válido: restaura antes de conectar', async () => {
    const dir = path.join(h.authDir, 'corrupt');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'creds.json'), '{"me": {"id": "55');
    fs.writeFileSync(path.join(dir, 'creds.json.bak'), JSON.stringify({ me: { id: '55119@s.whatsapp.net' } }));
    expect(await wa.restoreCredsIfCorrupted(dir)).toBe('restored');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8')).me.id).toBe('55119@s.whatsapp.net');
    expect(await wa.restoreCredsIfCorrupted(dir)).toBe('ok');
  });

  it('boot: sessão com creds.json corrompido e .bak válido continua sendo reconectada', async () => {
    const dir = path.join(h.authDir, 'boot-corrupt');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'creds.json'), 'xx');
    fs.writeFileSync(path.join(dir, 'creds.json.bak'), JSON.stringify({ me: { id: '55119@s.whatsapp.net' } }));
    const list = [{ id: 'bc', tenantId: TENANT, sessionId: 'boot-corrupt', status: 'CONNECTED' }];
    mockPrisma.whatsAppSession.findMany.mockImplementation(async (a: any) => (a.where.restrictedUntil ? [] : list));
    expect(await wa.reconnectAllSessions(() => 0)).toBe(1);
  });

  it('cada gravação de credenciais mantém um creds.json.bak (cópia atômica)', async () => {
    const dir = writeCreds('bak1');
    const sock = await start('bak1');
    sock.ev.emit('creds.update', {});
    await waitUntil(() => fs.existsSync(path.join(dir, 'creds.json.bak')));
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'creds.json.bak'), 'utf8')).me.id).toBeDefined();
    expect(fs.existsSync(path.join(dir, 'creds.json.bak.tmp'))).toBe(false);
  });

  it('SIGTERM: fecha SEM logout e espera a gravação pendente das credenciais', async () => {
    let saved = false;
    (useMultiFileAuthState as any).mockImplementationOnce(async () => ({
      state: { creds: h.creds, keys: {} },
      saveCreds: () => new Promise<void>((r) => setTimeout(() => { saved = true; r(); }, 1_000)),
    }));
    writeCreds('shut');
    const sock = await start('shut');
    sock.ev.emit('creds.update', {});
    const p = wa.shutdownAllSessions(1_500);
    await vi.advanceTimersByTimeAsync(1_500);
    await p;
    expect(saved).toBe(true);
    expect(sock.end).toHaveBeenCalled();
    expect(sock.logout).not.toHaveBeenCalled();
  });
});

describe('auditoria — aquecimento pelo pareamento (linkedAt)', () => {
  const linkedUpdate = () => mockPrisma.whatsAppSession.update.mock.calls.find((c: any[]) => c[0].data.status === 'CONNECTED')?.[0].data;

  it('reconexão do mesmo número já pareado: linkedAt NÃO muda', async () => {
    const sock = await start('lk1');
    mockPrisma.whatsAppSession.findUnique.mockResolvedValue({ phoneNumber: '5511999990000', linkedAt: new Date('2025-01-01') });
    sock.ev.emit('connection.update', { connection: 'open' });
    await waitUntil(() => !!linkedUpdate());
    expect(linkedUpdate().linkedAt).toBeUndefined();
  });

  it('QR lido agora (pareamento novo): linkedAt = agora (aquecimento recomeça)', async () => {
    h.creds = {};
    const sock = await start('lk2');
    mockPrisma.whatsAppSession.findUnique.mockResolvedValue({ phoneNumber: '5511999990000', linkedAt: new Date('2025-01-01') });
    sock.ev.emit('connection.update', { connection: 'open' });
    await waitUntil(() => !!linkedUpdate());
    expect(linkedUpdate().linkedAt).toEqual(new Date('2026-10-05T14:00:00Z'));
  });

  it('número trocado na mesma sessão: linkedAt = agora', async () => {
    const sock = await start('lk3');
    mockPrisma.whatsAppSession.findUnique.mockResolvedValue({ phoneNumber: '5511000000000', linkedAt: new Date('2025-01-01') });
    sock.ev.emit('connection.update', { connection: 'open' });
    await waitUntil(() => !!linkedUpdate());
    expect(linkedUpdate().linkedAt).toBeInstanceOf(Date);
  });

  it('credenciais apagadas (401): linkedAt zerado — o próximo QR é pareamento novo', async () => {
    writeCreds('lk4');
    const sock = await start('lk4');
    close(sock, 401);
    await waitUntil(() => mockPrisma.whatsAppSession.update.mock.calls.some((c: any[]) => c[0].data.linkedAt === null));
    expect(mockPrisma.whatsAppSession.update).toHaveBeenCalledWith({ where: { id: 'db-lk4' }, data: { linkedAt: null } });
  });
});

describe('auditoria — fluxo de mensagens recebidas', () => {
  it("opt-out recebido offline ('append'): marca o contato mas NÃO responde", async () => {
    setupIncoming();
    await wa.handleIncomingMessage(ctxIn(), incoming('OA1', 'Parar'), Date.now(), { source: 'append' });
    expect(mockPrisma.contact.update).toHaveBeenCalledWith({ where: { id: 'ct1' }, data: { optedOutAt: expect.any(Date) } });
    expect(mocks.outboundAdd).not.toHaveBeenCalled();
  });

  it('opt-out de quem recebeu campanha recente conta no kill-switch da campanha', async () => {
    setupIncoming();
    mockPrisma.campaignContact.findMany.mockResolvedValue([{ campaignId: 'camp-x' }]);
    await wa.handleIncomingMessage(ctxIn(), incoming('OK1', 'SAIR'));
    expect(mocks.recordCampaignOutcome).toHaveBeenCalledWith('camp-x', 'optout');
  });

  it("'append' com menos de 3 min: a IA responde (com atraso extra aleatório)", async () => {
    setupIncoming();
    await wa.handleIncomingMessage(ctxIn(), incoming('AF1', 'oi', { messageTimestamp: Math.floor(Date.now() / 1000) - 60 }), Date.now(), { source: 'append' });
    const delay = mocks.scheduleAiResponse.mock.calls[0][1];
    expect(delay).toBeGreaterThanOrEqual(6000);
    expect(delay).toBeLessThanOrEqual(26_000);
  });

  it("'append' com mais de 3 min: sem IA, conversa marcada como aguardando humano", async () => {
    setupIncoming();
    await wa.handleIncomingMessage(ctxIn(), incoming('AO1', 'oi', { messageTimestamp: Math.floor(Date.now() / 1000) - 300 }), Date.now(), { source: 'append' });
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'cv1' }, data: { status: 'HUMAN_TAKEOVER' } });
  });

  it('reenvio de placeholder (requestId): só grava — nem opt-out', async () => {
    setupIncoming();
    await wa.handleIncomingMessage(ctxIn(), incoming('PL1', 'SAIR'), Date.now(), { source: 'placeholder' });
    expect(mockPrisma.contact.update).not.toHaveBeenCalled();
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
  });

  it('1º contato fora do horário: só o aviso (sem saudação junto)', async () => {
    setupIncoming({ ticket: { ticket: { id: 'tk1', queueId: 'q1', status: 'PENDING' }, created: true } });
    mocks.isWithinBusinessHours.mockResolvedValue(false);
    await wa.handleIncomingMessage(ctxIn(), incoming('FH1', 'oi'));
    expect(greetingsQueued()).toBe(0);
    expect(mocks.offhoursAdd).toHaveBeenCalledTimes(1);
  });

  it('4 fotos seguidas (sem legenda): a IA responde todas (rótulo de mídia não é "repetição")', async () => {
    setupIncoming();
    mocks.downloadWhatsAppMedia.mockResolvedValue(null);
    for (let i = 1; i <= 4; i++) {
      await wa.handleIncomingMessage(ctxIn(), { ...incoming('PH' + i, ''), message: { imageMessage: { mimetype: 'image/jpeg' } } });
    }
    expect(mocks.scheduleAiResponse).toHaveBeenCalledTimes(4);
  });

  it('falha antes de gravar: o dedupe é liberado e o reenvio do WhatsApp é processado', async () => {
    setupIncoming();
    mockPrisma.message.create.mockRejectedValueOnce(new Error('banco fora'));
    const ctx = ctxIn();
    await wa.handleIncomingMessage(ctx, incoming('RT1', 'oi'));
    await wa.handleIncomingMessage(ctx, incoming('RT1', 'oi'));
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(2);
    expect(mocks.scheduleAiResponse).toHaveBeenCalledTimes(1);
  });
});

describe('auditoria — idempotência do envio', () => {
  it('erro 428 (conexão fechada ANTES de transmitir): libera a trava e a nova tentativa envia', async () => {
    const sock = await start('idem428');
    sock.sendMessage.mockRejectedValueOnce(Object.assign(new Error('Connection Closed'), { output: { statusCode: 428 } }));
    const p1 = wa.sendHumanized('idem428', 'a@s.whatsapp.net', { kind: 'text', text: 'oi' }, { idempotencyKey: 'k428' });
    const a1 = expect(p1).rejects.not.toBeInstanceOf(wa.MaybeSentError);
    await vi.advanceTimersByTimeAsync(20_000);
    await a1;
    const p2 = wa.sendHumanized('idem428', 'a@s.whatsapp.net', { kind: 'text', text: 'oi' }, { idempotencyKey: 'k428' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await p2).skipped).toBe(false);
    expect(sock.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('erro ao montar o conteúdo (arquivo inválido) não queima a trava', async () => {
    const sock = await start('idembuild');
    const p1 = wa.sendHumanized('idembuild', 'a@s.whatsapp.net', { kind: 'audio', path: path.join(os.tmpdir(), 'fora.ogg') }, { idempotencyKey: 'kb' });
    const a1 = expect(p1).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(20_000);
    await a1;
    const p2 = wa.sendHumanized('idembuild', 'a@s.whatsapp.net', { kind: 'text', text: 'oi' }, { idempotencyKey: 'kb' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await p2).skipped).toBe(false);
    expect(sock.sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('auditoria — boot, versão e retentativa longa', () => {
  it('reinício há < 60 s (loop de crash): espera 60 s antes de reconectar', async () => {
    writeCreds('crash1');
    await h.fakeRedis.current.set('wa:lastBootAt', String(Date.now() - 10_000));
    const list = [{ id: 'cr1', tenantId: TENANT, sessionId: 'crash1', status: 'CONNECTED' }];
    mockPrisma.whatsAppSession.findMany.mockImplementation(async (a: any) => (a.where.restrictedUntil ? [] : list));
    await wa.reconnectAllSessions(() => 0);
    await flush();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(makeWASocket).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_500);
    await waitUntil(() => sockets() >= 1);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('boot regrava no Redis as restrições ainda válidas do banco', async () => {
    const until = new Date(Date.now() + 3600_000);
    mockPrisma.whatsAppSession.findMany.mockImplementation(async (a: any) => (a.where.restrictedUntil ? [{ sessionId: 'rb', restrictedUntil: until }] : []));
    await wa.reconnectAllSessions(() => 0);
    expect(await h.fakeRedis.current.get('wa:restricted:rb')).toBe(String(until.getTime()));
  });

  it('busca da versão do WA Web travada: desiste em 15 s e usa a versão de reserva', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (fetchLatestBaileysVersion as any).mockImplementationOnce(() => new Promise(() => {}));
    const p = wa.getWaVersion(true);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await p).toEqual(expect.any(Array));
    warn.mockRestore();
  });

  it('falha ao iniciar: nova tentativa em 30–60 min (sem loop rápido) + aviso no painel e e-mail ao dono', async () => {
    (useMultiFileAuthState as any).mockRejectedValueOnce(new Error('disco cheio'));
    await wa.startBaileysSession(TENANT, 'db-long', 'long', path.join(h.authDir, 'long'));
    expect(wa.getConnectionDebugState().reconnectTimers).toContain('long');
    expect(h.emitted.some((e) => e.event === 'whatsapp:alert')).toBe(true);
    await waitUntil(() => mocks.sendEmail.mock.calls.length > 0);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'dono@empresa.com' }));
    await vi.advanceTimersByTimeAsync(29 * 60_000);
    expect(makeWASocket).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(32 * 60_000);
    await waitUntil(() => sockets() >= 1);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });
});

describe('auditoria — restrição completa e tetos de envio', () => {
  it('restrição: campanhas RUNNING do número → PAUSED, webhook whatsapp.restricted e e-mail ao dono', async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([{ id: 'camp-run' }]);
    await h.fakeRedis.current.set('campaign:token:camp-run', 'tok');
    await wa.restrictSession(TENANT, 'db-rx', 'rx', '463');
    expect(mockPrisma.campaign.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['camp-run'] } }, data: { status: 'PAUSED' } });
    expect(await h.fakeRedis.current.get('campaign:token:camp-run')).toBeNull();
    expect(mocks.emitWebhookEvent).toHaveBeenCalledWith(TENANT, 'whatsapp.restricted', expect.objectContaining({ code: '463' }));
    await waitUntil(() => mocks.sendEmail.mock.calls.length > 0);
    expect(mocks.sendEmail.mock.calls[0][0].subject).toMatch(/limitou/);
  });

  it('2ª restrição em 30 dias: campanhas do número desligadas', async () => {
    mockPrisma.whatsAppSession.findUnique.mockResolvedValue({
      restrictionIncidents: [new Date(Date.now() - 5 * 86_400_000).toISOString()], campaignsDisabledAt: null,
    });
    await wa.restrictSession(TENANT, 'db-ry', 'ry', '463');
    expect(mockPrisma.whatsAppSession.update).toHaveBeenCalledWith({
      where: { id: 'db-ry' },
      data: expect.objectContaining({ campaignsDisabledAt: expect.any(Date) }),
    });
  });

  it('OWNER/ADMIN limpa a restrição: Redis e banco liberados', async () => {
    await wa.restrictSession(TENANT, 'db-rz', 'rz', '463');
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'db-rz', sessionId: 'rz', restrictedUntil: null, restrictionIncidents: [], campaignsDisabledAt: null, status: 'CONNECTED' });
    const info = await wa.clearRestriction(TENANT, 'db-rz');
    expect(info.restrictedUntil).toBeNull();
    expect(mockPrisma.whatsAppSession.update).toHaveBeenCalledWith({ where: { id: 'db-rz' }, data: { restrictedUntil: null } });
  });

  it('vazão: 20 clientes ao mesmo tempo — no máx. 10 respostas automáticas por minuto no número', async () => {
    await start('rate1');
    const waits = [];
    for (let i = 0; i < 20; i++) waits.push(await wa.reserveAutomaticSend('rate1', 'auto'));
    expect(waits.filter((w) => w === 0)).toHaveLength(10);
    expect(waits.filter((w) => w > 0)).toHaveLength(10);
    expect(h.emitted.some((e) => e.event === 'whatsapp:rate-warning')).toBe(true);
  });

  it('mais de 1500 automáticas no dia: automações do número pausadas até a meia-noite', async () => {
    await start('daily1');
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    await h.fakeRedis.current.set(`wa:auto:day:daily1:${day}`, '1500');
    await expect(wa.reserveAutomaticSend('daily1', 'auto')).rejects.toBeInstanceOf(wa.SessionRestrictedError);
    expect(h.emitted.some((e) => e.event === 'whatsapp:restricted' && e.payload.code === 'DAILY_LIMIT')).toBe(true);
    // não conta como incidente de restrição do WhatsApp
    const upd = mockPrisma.whatsAppSession.update.mock.calls.find((c: any[]) => c[0].data.restrictedUntil);
    expect(upd[0].data.restrictionIncidents).toBeUndefined();
  });
});

describe('auditoria — kill-switch: ack de erro de mensagem de campanha', () => {
  it('erro no ack de uma mensagem de campanha conta como erro da campanha', async () => {
    const sock = await start('ackc');
    await h.fakeRedis.current.set('wa:campmsg:ackc:WAX', 'camp-ack');
    sock.ev.emit('messages.update', [{ key: { fromMe: true, id: 'WAX' }, update: { status: 0, messageStubParameters: ['479'] } }]);
    await waitUntil(() => mocks.recordCampaignOutcome.mock.calls.length > 0);
    expect(mocks.recordCampaignOutcome).toHaveBeenCalledWith('camp-ack', 'error');
  });
});

describe('auditoria — rota de resposta nunca cai em outro número', () => {
  it('conversa sem número conhecido: null (erro claro), sem usar o 1º conectado', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      channel: 'WHATSAPP', contactPhone: '5511988887777', contactId: null, whatsappSession: null, ticket: null,
    });
    mockPrisma.message.findFirst.mockResolvedValue(null);
    expect(await wa.resolveConversationRoute(TENANT, 'cv-x')).toBeNull();
    expect(mockPrisma.whatsAppSession.findFirst).not.toHaveBeenCalled();
  });
});
