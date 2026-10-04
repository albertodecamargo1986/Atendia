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
  const sock: any = {
    ev,
    user: { id: '5511999990000:1@s.whatsapp.net' },
    end: vi.fn(),
    logout: vi.fn(async () => {}),
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
vi.mock('../lib/ai-schedule.js', () => ({ scheduleAiResponse: mocks.scheduleAiResponse }));

import makeWASocket, { fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import * as wa from '../services/whatsapp.service.js';
import { OPT_OUT_REPLY } from '../lib/opt-out.js';

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
    mockPrisma.whatsAppSession.findMany.mockResolvedValueOnce([
      { id: 'b1', tenantId: TENANT, sessionId: 'boot1', status: 'CONNECTED' },
      { id: 'b2', tenantId: TENANT, sessionId: 'boot2', status: 'CONNECTING' },
      { id: 'b3', tenantId: TENANT, sessionId: 'boot3', status: 'CONNECTED' },
    ]);
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
    expect(mockPrisma.whatsAppSession.update).toHaveBeenCalledWith({ where: { id: 'db-r463' }, data: { restrictedUntil: expect.any(Date) } });
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
    expect(mocks.scheduleAiResponse).toHaveBeenCalledWith({ tenantId: TENANT, conversationId: 'cv1', agentId: 'ag1', triggerMessageId: expect.any(String) });
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

  it('mensagem antiga (> 10 min): grava, mas não dispara IA, saudação nem aviso', async () => {
    setupIncoming({ ticket: { ticket: { id: 'tk1', queueId: 'q1', status: 'PENDING' }, created: true } });
    await wa.handleIncomingMessage(ctxIn(), incoming('O1', 'oi', { messageTimestamp: Math.floor(Date.now() / 1000) - 3600 }));
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.message.create.mock.calls[0][0].data.metadata.late).toBe(true);
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
    expect(mocks.outboundAdd).not.toHaveBeenCalled();
    expect(mocks.offhoursAdd).not.toHaveBeenCalled();
  });

  it("'append' (offline) e reenvio de placeholder (requestId): só gravam", async () => {
    setupIncoming();
    const ctx = ctxIn();
    const sock = await start('upsert-append');
    sock.ev.emit('messages.upsert', { type: 'append', messages: [incoming('AP1', 'oi offline')] });
    sock.ev.emit('messages.upsert', { type: 'notify', requestId: 'req', messages: [incoming('AP2', 'forjada?')] });
    await flush(20);
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(2);
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
