/**
 * API oficial (Cloud API) de ponta a ponta, usando o whatsapp.service REAL (mesma função de
 * entrada, mesmo serializador, mesmas travas) e o worker de saída real. Nada de rede: a Graph API
 * é um fetch falso; prisma, Redis, filas e serviços vizinhos são mocks.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createFakeRedis } from './helpers/fake-redis.js';

const h = vi.hoisted(() => {
  process.env.SESSION_ENCRYPTION_KEY = 'y'.repeat(40);
  const tmp = (process.env.TEMP || process.env.TMPDIR || '/tmp').split('\\').join('/');
  const base = `${tmp}/atendia-cloud-test-${process.pid}-${Date.now()}`;
  return {
    base,
    authDir: `${base}/auth`,
    uploadDir: `${base}/uploads`,
    fakeRedis: { current: null as any },
    emitted: [] as Array<{ room: string; event: string; payload: any }>,
    sockets: [] as any[],
    rows: [] as any[],
    msgCounter: 0,
    genId: 0,
  };
});

function createFakeSock() {
  return {
    ev: { on: vi.fn(), removeAllListeners: vi.fn(), emit: vi.fn() },
    user: { id: '5511999990000:1@s.whatsapp.net' },
    end: vi.fn(),
    logout: vi.fn(async () => {}),
    readMessages: vi.fn(async () => {}),
    presenceSubscribe: vi.fn(async () => {}),
    sendPresenceUpdate: vi.fn(async () => {}),
    sendMessage: vi.fn(async (_jid: string, _c: any, opts: any) => ({ key: { id: opts?.messageId, fromMe: true }, message: { conversation: 'ok' } })),
    onWhatsApp: vi.fn(async (jid: string) => [{ jid, exists: true }]),
  };
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
    useMultiFileAuthState: vi.fn(async () => ({ state: { creds: { me: { id: '5511999990000:1@s.whatsapp.net' } }, keys: {} }, saveCreds: vi.fn() })),
    fetchLatestBaileysVersion: vi.fn(async () => ({ version: [2, 3000, 1], isLatest: true })),
    makeCacheableSignalKeyStore: vi.fn((k: any) => k),
    generateMessageIDV2: vi.fn(() => `GEN${++h.genId}`),
  };
});

vi.mock('../config/index.js', () => ({
  getWhatsAppAuthDir: () => h.authDir,
  getUploadRoot: () => h.uploadDir,
  getConfig: () => ({ SMTP_HOST: '' }),
}));
vi.mock('../lib/redis.js', () => ({
  default: new Proxy({}, { get: (_t, prop) => (h.fakeRedis.current as any)[prop] }),
}));

const { mockPrisma, mocks } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      whatsAppSession: {
        findFirst: fn(), findUnique: fn(), findMany: fn(), update: fn(), updateMany: fn(), create: fn(), count: fn(), delete: fn(),
      },
      tenant: { findUnique: fn() },
      agent: { findFirst: fn() },
      contact: { findFirst: fn(), update: fn() },
      conversation: { findFirst: fn(), findUnique: fn(), update: fn(), updateMany: fn(), create: fn() },
      message: { create: fn(), findFirst: fn(), findUnique: fn(), update: fn() },
      ticket: { update: fn(), findUnique: fn() },
      user: { findMany: fn() },
      campaign: { findMany: fn(), updateMany: fn() },
      campaignContact: { findMany: fn() },
    },
    mocks: {
      offhoursAdd: vi.fn(),
      outboundAdd: vi.fn(),
      transcriptionAdd: vi.fn(),
      cloudWebhookAdd: vi.fn(),
      isWithinBusinessHours: vi.fn(),
      findOrCreateContact: vi.fn(),
      findOrCreateTicket: vi.fn(),
      updateTicket: vi.fn(),
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
  whatsappCloudWebhookQueue: { add: mocks.cloudWebhookAdd },
}));
vi.mock('../services/business-hours.service.js', () => ({ isWithinBusinessHours: mocks.isWithinBusinessHours }));
vi.mock('../services/contact.service.js', () => ({ findOrCreateContact: mocks.findOrCreateContact }));
vi.mock('../services/ticket.service.js', () => ({ findOrCreateTicket: mocks.findOrCreateTicket, updateTicket: mocks.updateTicket }));
vi.mock('../services/ticket.dispatcher.js', () => ({ dispatchTicket: mocks.dispatchTicket }));
vi.mock('../services/queue.service.js', () => ({ getQueueForWhatsapp: mocks.getQueueForWhatsapp }));
vi.mock('../services/voice.service.js', () => ({
  downloadWhatsAppMedia: mocks.downloadWhatsAppMedia,
  MAX_INCOMING_MEDIA_BYTES: 16 * 1024 * 1024,
  mediaExtension: (mime?: string) => (mime === 'image/jpeg' ? 'jpg' : 'bin'),
}));
vi.mock('../services/webhook.service.js', () => ({ emitWebhookEvent: mocks.emitWebhookEvent }));
vi.mock('../lib/ai-schedule.js', () => ({ scheduleAiResponse: mocks.scheduleAiResponse, AI_DEBOUNCE_MS: 6000 }));
vi.mock('../lib/email.js', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('../services/campaign.service.js', () => ({
  campaignTokenKey: (id: string) => `campaign:token:${id}`,
  recordCampaignOutcome: mocks.recordCampaignOutcome,
}));

import makeWASocket from '@whiskeysockets/baileys';
import * as wa from '../services/whatsapp.service.js';
import * as cloud from '../services/whatsapp-cloud.service.js';
import { processOutboundJob } from '../workers/whatsapp-outbound.worker.js';
import { encryptSecret } from '../lib/secret-box.js';
import { computeSignature } from '../lib/wa-cloud-webhook.js';
import { invalidateProviderCache, OutsideWindowError } from '../lib/wa-provider.js';
import { CloudApiError } from '../lib/wa-cloud-api.js';
import { _resetRestrictionCache, markSessionRestricted } from '../lib/wa-guards.js';
import { OPT_OUT_REPLY } from '../lib/opt-out.js';

const TENANT = 't1';
const DB_ID = '11111111-1111-4111-8111-111111111111';
const SID = 'wacloud_t1_abc';
const PNID = '1234567890';
const TOKEN = 'EAAG-token-permanente-0001';
const SECRET = 'abcdef0123456789abcdef0123456789';
const CUSTOMER = '5511988887777';
const JID = `${CUSTOMER}@s.whatsapp.net`;

function cloudRow(over: Record<string, any> = {}) {
  return {
    id: DB_ID, sessionId: SID, tenantId: TENANT, status: 'CONNECTED', provider: 'CLOUD_API', phoneNumber: '551130000000',
    cloudPhoneNumberId: PNID, restrictedUntil: null, restrictionIncidents: null, campaignsDisabledAt: null, linkedAt: new Date(),
    cloudConfig: {
      wabaId: '99887766', accessTokenEnc: encryptSecret(TOKEN), appSecretEnc: encryptSecret(SECRET),
      verifyToken: 'verify-tok-123', messagingLimitTier: 'TIER_1K', displayPhoneNumber: '+55 11 3000-0000',
    },
    ...over,
  };
}

let fetchMock: any;
const graphCalls = () => fetchMock.mock.calls.map((c: any[]) => ({ url: String(c[0]), body: c[1]?.body && typeof c[1].body === 'string' ? JSON.parse(c[1].body) : c[1]?.body }));
const sentBodies = () => graphCalls().filter((c: any) => c.url.endsWith('/messages') && c.body?.type);
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let testNo = 0;
let lastCustomerAt: Date | null = null;

function setupIncoming(over: { conversation?: any; contact?: any; ticket?: any } = {}) {
  const conversation = over.conversation ?? {
    id: 'cv1', status: 'ACTIVE', agentId: 'ag1', agent: { isActive: true, name: 'Bot' }, contactId: 'ct1', whatsappSessionId: DB_ID,
  };
  mockPrisma.conversation.findFirst.mockResolvedValue(conversation);
  mocks.findOrCreateContact.mockResolvedValue(over.contact ?? { id: 'ct1', optedOutAt: null });
  mocks.findOrCreateTicket.mockResolvedValue(over.ticket ?? { ticket: { id: 'tk1', queueId: 'q1', status: 'PENDING' }, created: false });
  mocks.getQueueForWhatsapp.mockResolvedValue({ id: 'q1', greetingMessage: 'Bem-vindo!' });
  mocks.isWithinBusinessHours.mockResolvedValue(true);
}

function webhookBody(messages: any[], opts: { phoneNumberId?: string; statuses?: any[] } = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: '99887766',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '551130000000', phone_number_id: opts.phoneNumberId ?? PNID },
          contacts: [{ wa_id: CUSTOMER, profile: { name: 'Maria' } }],
          messages,
          statuses: opts.statuses ?? [],
        },
      }],
    }],
  };
}
const textMsg = (id: string, body: string) => ({ from: CUSTOMER, id, timestamp: String(Math.floor(Date.now() / 1000) - 5), type: 'text', text: { body } });
const run = (body: any) => cloud.processCloudWebhookJob({ dbSessionId: DB_ID, body });
/** O serializador por número espera 1,2 s entre envios (timers falsos): avança o relógio. */
async function settle<T>(p: Promise<T>): Promise<T> {
  p.catch(() => {});
  await vi.advanceTimersByTimeAsync(3_000);
  return p;
}
const send = (...args: Parameters<typeof wa.sendCloudSerialized>) => settle(wa.sendCloudSerialized(...args));
const outbound = (j: any) => settle(processOutboundJob(j));
const userMessages = () => mockPrisma.message.create.mock.calls.filter((c: any[]) => c[0].data.role === 'USER');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  // Cada teste começa 1 h depois do anterior: o serializador por número (1,2 s) nunca espera de um teste para o outro
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 5, 14, 0, 0) + ++testNo * 3600_000));
  h.fakeRedis.current = createFakeRedis();
  h.emitted.length = 0;
  h.rows = [cloudRow()];
  lastCustomerAt = new Date(Date.now() - 60_000);
  vi.clearAllMocks();
  invalidateProviderCache();
  _resetRestrictionCache();
  wa._resetAutoLimiter();
  for (const m of Object.values(mockPrisma)) for (const f of Object.values(m)) (f as any).mockResolvedValue({});
  mockPrisma.whatsAppSession.findUnique.mockImplementation(async ({ where }: any) =>
    h.rows.find((r) => (where.id && r.id === where.id) || (where.sessionId && r.sessionId === where.sessionId)) ?? null);
  mockPrisma.whatsAppSession.findFirst.mockImplementation(async ({ where }: any) =>
    h.rows.find((r) => (!where.id || r.id === where.id) && (!where.cloudPhoneNumberId || r.cloudPhoneNumberId === where.cloudPhoneNumberId)
      && (!where.tenantId || r.tenantId === where.tenantId)) ?? null);
  mockPrisma.whatsAppSession.findMany.mockResolvedValue([]);
  mockPrisma.message.create.mockImplementation(async ({ data }: any) => ({ id: `m${++h.msgCounter}`, ...data }));
  mockPrisma.message.findFirst.mockResolvedValue(null);
  mockPrisma.message.findUnique.mockResolvedValue({ metadata: {} });
  mockPrisma.contact.findFirst.mockResolvedValue(null);
  mockPrisma.conversation.findUnique.mockImplementation(async () => ({ lastCustomerMessageAt: lastCustomerAt }));
  mockPrisma.campaign.findMany.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mocks.recordCampaignOutcome.mockResolvedValue(false);
  fetchMock = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.endsWith('/messages')) return json(200, { messages: [{ id: `wamid.OUT${fetchMock.mock.calls.length}` }] });
    return json(200, {});
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

afterAll(() => {
  fs.rmSync(h.base, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('webhook — rotas públicas (verificação e assinatura)', () => {
  it('GET: verify token certo → challenge; errado ou sessão inexistente → null (403)', async () => {
    const q = { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-tok-123', 'hub.challenge': 'CH-42' };
    expect(await cloud.verifyWebhook(DB_ID, q)).toBe('CH-42');
    expect(await cloud.verifyWebhook(DB_ID, { ...q, 'hub.verify_token': 'errado' })).toBeNull();
    expect(await cloud.verifyWebhook('22222222-2222-4222-8222-222222222222', q)).toBeNull();
    expect(await cloud.verifyWebhook('../../etc', q)).toBeNull();
  });

  it('GET: sessão do QR Code (Baileys) não responde ao webhook oficial', async () => {
    h.rows = [cloudRow({ provider: 'BAILEYS' })];
    expect(await cloud.verifyWebhook(DB_ID, { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-tok-123', 'hub.challenge': 'x' })).toBeNull();
  });

  it('POST: assinatura válida → enfileira (200 rápido); inválida/tamanho diferente → não enfileira', async () => {
    const body = webhookBody([textMsg('wamid.1', 'oi')]);
    const raw = Buffer.from(JSON.stringify(body));
    expect(await cloud.receiveWebhook(DB_ID, raw, computeSignature(raw, SECRET), body)).toBe('queued');
    expect(mocks.cloudWebhookAdd).toHaveBeenCalledWith('event', { dbSessionId: DB_ID, body });

    mocks.cloudWebhookAdd.mockClear();
    expect(await cloud.receiveWebhook(DB_ID, raw, computeSignature(raw, 'outro-segredo-0000000000000000'), body)).toBe('invalid_signature');
    expect(await cloud.receiveWebhook(DB_ID, raw, computeSignature(raw, SECRET) + '00', body)).toBe('invalid_signature');
    expect(await cloud.receiveWebhook(DB_ID, undefined, computeSignature(raw, SECRET), body)).toBe('invalid_signature');
    expect(await cloud.receiveWebhook('22222222-2222-4222-8222-222222222222', raw, computeSignature(raw, SECRET), body)).toBe('not_found');
    expect(mocks.cloudWebhookAdd).not.toHaveBeenCalled();
  });
});

describe('entrada pela MESMA função do QR Code (proteções compartilhadas)', () => {
  it('texto: grava, abre a janela de 24 h, agenda a IA com debounce — sem abrir socket do Baileys', async () => {
    setupIncoming();
    const res = await run(webhookBody([textMsg('wamid.IN1', 'Olá, quero um orçamento')]));
    expect(res).toMatchObject({ messages: 1 });
    expect(userMessages()).toHaveLength(1);
    expect(userMessages()[0][0].data).toMatchObject({
      conversationId: 'cv1', content: 'Olá, quero um orçamento',
      metadata: expect.objectContaining({ sessionId: SID, messageId: 'wamid.IN1', jid: JID }),
    });
    // Gravação condicional: a janela só avança (nunca retrocede com webhook atrasado)
    expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'cv1', OR: [{ lastCustomerMessageAt: null }, { lastCustomerMessageAt: { lt: expect.any(Date) } }] },
      data: { lastCustomerMessageAt: expect.any(Date) },
    });
    expect(mocks.scheduleAiResponse).toHaveBeenCalledWith({ tenantId: TENANT, conversationId: 'cv1', agentId: 'ag1', triggerMessageId: expect.any(String) }, 6000);
    expect(makeWASocket).not.toHaveBeenCalled();
    expect(mocks.findOrCreateContact).toHaveBeenCalledWith(TENANT, CUSTOMER, 'Maria', undefined, false, undefined);
  });

  it('dedupe: a Meta reenviando o mesmo wamid é processado 1x', async () => {
    setupIncoming();
    const body = webhookBody([textMsg('wamid.DUP', 'oi')]);
    await run(body);
    await run(body);
    expect(userMessages()).toHaveLength(1);
    expect(mocks.scheduleAiResponse).toHaveBeenCalledTimes(1);
  });

  it('opt-out (SAIR): marca o contato, confirma UMA vez e a IA não responde', async () => {
    setupIncoming();
    await run(webhookBody([textMsg('wamid.S1', 'SAIR')]));
    expect(mockPrisma.contact.update).toHaveBeenCalledWith({ where: { id: 'ct1' }, data: { optedOutAt: expect.any(Date) } });
    expect(mocks.outboundAdd).toHaveBeenCalledWith('send', expect.objectContaining({ content: OPT_OUT_REPLY, automatic: true, sessionId: SID, jid: JID }), expect.any(Object));
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
    mocks.findOrCreateContact.mockResolvedValue({ id: 'ct1', optedOutAt: new Date() });
    await run(webhookBody([textMsg('wamid.S2', 'parar')]));
    expect(mocks.outboundAdd).toHaveBeenCalledTimes(1);
  });

  it('mensagem idêntica repetida > 3x seguidas: a IA para (anti-loop/robô)', async () => {
    setupIncoming();
    for (let i = 1; i <= 5; i++) await run(webhookBody([textMsg(`wamid.R${i}`, 'Menu')]));
    expect(mocks.scheduleAiResponse).toHaveBeenCalledTimes(3);
  });

  it('fora do horário: aviso 1x a cada 12 h, sem IA', async () => {
    setupIncoming();
    mocks.isWithinBusinessHours.mockResolvedValue(false);
    await run(webhookBody([textMsg('wamid.F1', 'oi')]));
    await run(webhookBody([textMsg('wamid.F2', 'alguém?')]));
    expect(mocks.offhoursAdd).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
  });

  it('saudação da fila: só 1x por conversa (ticket criado agora)', async () => {
    setupIncoming({ ticket: { ticket: { id: 'tk1', queueId: 'q1', status: 'PENDING' }, created: true } });
    await run(webhookBody([textMsg('wamid.G1', 'oi')]));
    await run(webhookBody([textMsg('wamid.G2', 'oi de novo')]));
    const greetings = mockPrisma.message.create.mock.calls.filter((c: any[]) => c[0].data.metadata?.automatic === 'greeting');
    expect(greetings).toHaveLength(1);
  });

  it('conversa com humano (HUMAN_TAKEOVER): grava mas não chama a IA', async () => {
    setupIncoming({ conversation: { id: 'cv2', status: 'HUMAN_TAKEOVER', agentId: 'ag1', agent: { isActive: true, name: 'Bot' }, contactId: 'ct1', whatsappSessionId: DB_ID } });
    await run(webhookBody([textMsg('wamid.H1', 'oi')]));
    expect(userMessages()).toHaveLength(1);
    expect(mocks.scheduleAiResponse).not.toHaveBeenCalled();
  });

  it('reação é ignorada (não vira mensagem nem aciona a IA)', async () => {
    setupIncoming();
    const res = await run(webhookBody([{ from: CUSTOMER, id: 'wamid.RE', timestamp: '1', type: 'reaction', reaction: { message_id: 'x', emoji: '👍' } }]));
    expect(res).toMatchObject({ messages: 0, ignored: 1 });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('evento de outro phone_number_id (outro app) é ignorado', async () => {
    setupIncoming();
    const res = await run(webhookBody([textMsg('wamid.X', 'oi')], { phoneNumberId: '5555555555' }));
    expect(res).toMatchObject({ messages: 0, ignored: 1 });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('número desconectado: mensagens não entram (como no QR Code)', async () => {
    h.rows = [cloudRow({ status: 'DISCONNECTED' })];
    setupIncoming();
    const res = await run(webhookBody([textMsg('wamid.D', 'oi')]));
    expect(res).toMatchObject({ messages: 0 });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('imagem: baixa pela Graph API com o token e salva nos uploads do tenant', async () => {
    setupIncoming();
    fetchMock.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/MEDIA-1')) return json(200, { url: 'https://lookaside.fbsbx.com/m1', mime_type: 'image/jpeg', file_size: 4 });
      if (u.startsWith('https://lookaside')) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
      return json(200, {});
    });
    await run(webhookBody([{ from: CUSTOMER, id: 'wamid.IMG', timestamp: String(Math.floor(Date.now() / 1000)), type: 'image', image: { id: 'MEDIA-1', mime_type: 'image/jpeg', caption: 'olha' } }]));
    const data = userMessages()[0][0].data;
    expect(data.content).toBe('olha');
    expect(data.mediaType).toBe('IMAGE');
    expect(data.mediaUrl).toMatch(new RegExp(`^/uploads/${TENANT}/media/.+\\.jpg$`));
    expect(mocks.downloadWhatsAppMedia).not.toHaveBeenCalled();
  });
});

describe('status de entrega e erros da Meta', () => {
  it('delivered/read atualizam a mensagem (sem rebaixar o status)', async () => {
    mockPrisma.message.findFirst.mockResolvedValue({ id: 'mOut', conversationId: 'cv1', metadata: { waMessageId: 'wamid.O1', deliveryStatus: 'sent' } });
    await run(webhookBody([], { statuses: [{ id: 'wamid.O1', status: 'read', timestamp: '1' }] }));
    expect(mockPrisma.message.update).toHaveBeenCalledWith({ where: { id: 'mOut' }, data: { metadata: expect.objectContaining({ deliveryStatus: 'read' }) } });
    mockPrisma.message.update.mockClear();
    mockPrisma.message.findFirst.mockResolvedValue({ id: 'mOut', conversationId: 'cv1', metadata: { waMessageId: 'wamid.O1', deliveryStatus: 'read' } });
    await run(webhookBody([], { statuses: [{ id: 'wamid.O1', status: 'delivered' }] }));
    expect(mockPrisma.message.update).not.toHaveBeenCalled();
  });

  it('failed 131047 (fora da janela): nota ao operador em português', async () => {
    mockPrisma.message.findFirst.mockResolvedValue({ id: 'mOut', conversationId: 'cv1', metadata: { waMessageId: 'wamid.O2' } });
    await run(webhookBody([], { statuses: [{ id: 'wamid.O2', status: 'failed', errors: [{ code: 131047, title: 'Re-engagement message' }] }] }));
    const note = mockPrisma.message.create.mock.calls.find((c: any[]) => c[0].data.role === 'SYSTEM');
    expect(note[0].data.content).toMatch(/Fora da janela de 24h/);
    expect(mockPrisma.message.update).toHaveBeenCalledWith({ where: { id: 'mOut' }, data: { metadata: expect.objectContaining({ status: 'failed', errorCode: 131047 }) } });
  });

  it('failed 131048 (spam): mesma rotina de restrição — automações pausadas 24 h, painel avisado', async () => {
    mockPrisma.message.findFirst.mockResolvedValue({ id: 'mOut', conversationId: 'cv1', metadata: {} });
    await h.fakeRedis.current.set(`wa:campmsg:${SID}:wamid.O3`, 'camp-1');
    await run(webhookBody([], { statuses: [{ id: 'wamid.O3', status: 'failed', errors: [{ code: 131048 }] }] }));
    expect(await h.fakeRedis.current.get(`wa:restricted:${SID}`)).toBeTruthy();
    expect(h.emitted.some((e) => e.event === 'whatsapp:restricted' && e.payload.code === 'META_131048')).toBe(true);
    expect(mocks.recordCampaignOutcome).toHaveBeenCalledWith('camp-1', 'error');
    expect(mockPrisma.whatsAppSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: DB_ID }, data: expect.objectContaining({ restrictedUntil: expect.any(Date), restrictionIncidents: expect.any(Array) }),
    }));
  });
});

describe('envio pela API oficial (serializador, janela, idempotência)', () => {
  it('dentro da janela: "visto"+"digitando" na mensagem do cliente e depois o texto', async () => {
    setupIncoming();
    await run(webhookBody([textMsg('wamid.IN9', 'oi')]));
    const res = await send(SID, JID, { kind: 'text', text: 'Olá Maria!' }, { conversationId: 'cv1', idempotencyKey: 'm-a' });
    expect(res).toEqual({ skipped: false, id: expect.stringMatching(/^wamid\.OUT/) });
    const calls = graphCalls();
    expect(calls[0].body).toMatchObject({ status: 'read', message_id: 'wamid.IN9', typing_indicator: { type: 'text' } });
    expect(calls[1].body).toMatchObject({ to: CUSTOMER, type: 'text', text: { body: 'Olá Maria!', preview_url: false } });
    expect(calls[1].url).toContain(`/${PNID}/messages`);
  });

  it('fora da janela de 24 h: mensagem livre bloqueada antes de chamar a Meta', async () => {
    lastCustomerAt = new Date(Date.now() - 25 * 3600_000);
    await expect(send(SID, JID, { kind: 'text', text: 'oi' }, { conversationId: 'cv1' })).rejects.toBeInstanceOf(OutsideWindowError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('modelo aprovado sai mesmo fora da janela', async () => {
    lastCustomerAt = null;
    await send(SID, JID, { kind: 'template', name: 'retorno', language: 'pt_BR', bodyParams: ['Maria'] }, { conversationId: 'cv1' });
    expect(sentBodies()[0].body).toMatchObject({ type: 'template', template: { name: 'retorno', language: { code: 'pt_BR' } } });
  });

  it('idempotência: o mesmo messageId nunca sai 2x', async () => {
    await send(SID, JID, { kind: 'text', text: 'a' }, { conversationId: 'cv1', idempotencyKey: 'same' });
    const second = await send(SID, JID, { kind: 'text', text: 'a' }, { conversationId: 'cv1', idempotencyKey: 'same' });
    expect(second).toEqual({ skipped: true });
    expect(sentBodies()).toHaveLength(1);
  });

  it('serializador por número: dois envios ao mesmo tempo saem um por vez, ≥ 1,2 s entre eles', async () => {
    const times: number[] = [];
    fetchMock.mockImplementation(async () => { times.push(Date.now()); return json(200, { messages: [{ id: 'wamid.S' }] }); });
    const p1 = wa.sendCloudSerialized(SID, JID, { kind: 'text', text: '1' }, { conversationId: 'cv1' });
    const p2 = wa.sendCloudSerialized(SID, JID, { kind: 'text', text: '2' }, { conversationId: 'cv1' });
    await vi.advanceTimersByTimeAsync(3_000);
    await Promise.all([p1, p2]);
    expect(times).toHaveLength(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1_200);
  });

  it('Meta recusa por spam (131048): CloudApiError, trava de idempotência liberada e número restrito', async () => {
    fetchMock.mockImplementation(async () => json(400, { error: { code: 131048, message: 'Spam rate limit hit' } }));
    await expect(send(SID, JID, { kind: 'text', text: 'x' }, { conversationId: 'cv1', idempotencyKey: 'k131048' }))
      .rejects.toBeInstanceOf(CloudApiError);
    expect(await h.fakeRedis.current.get('wa:out:k131048')).toBeNull();
    expect(await h.fakeRedis.current.get(`wa:restricted:${SID}`)).toBeTruthy();
    // automáticas ficam bloqueadas; o operador humano ainda pode tentar
    await expect(send(SID, JID, { kind: 'text', text: 'auto' }, { conversationId: 'cv1', automatic: true }))
      .rejects.toBeInstanceOf(wa.SessionRestrictedError);
  });

  it('sem resposta da Meta (rede): MaybeSentError — não repetir', async () => {
    fetchMock.mockImplementation(async () => { throw new TypeError('fetch failed'); });
    await expect(send(SID, JID, { kind: 'text', text: 'x' }, { conversationId: 'cv1', idempotencyKey: 'knet' }))
      .rejects.toBeInstanceOf(wa.MaybeSentError);
    expect(await h.fakeRedis.current.get('wa:out:knet')).toBe('1');
  });

  it('número restrito: envio automático nem chama a Meta', async () => {
    await markSessionRestricted(SID, new Date(Date.now() + 3600_000));
    await expect(send(SID, JID, { kind: 'text', text: 'x' }, { conversationId: 'cv1', automatic: true }))
      .rejects.toBeInstanceOf(wa.SessionRestrictedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('campanha oficial: só modelo, pelo teto combinado de automáticas', async () => {
    const r = await settle(wa.sendCloudCampaignTemplate(SID, CUSTOMER, { name: 'promo', language: 'pt_BR', bodyParams: ['Maria'] }, 'campaign-r1'));
    expect(r).toMatchObject({ exists: true, skipped: false, jid: JID });
    expect(sentBodies()[0].body).toMatchObject({ type: 'template', template: { name: 'promo' } });
    // teto combinado (15/min) é o MESMO do QR Code
    const waits = [];
    for (let i = 0; i < 20; i++) waits.push(await wa.reserveAutomaticSend(SID, 'campaign'));
    expect(waits.filter((w) => w === 0)).toHaveLength(14);
  });
});

describe('worker de saída: roteia para o provedor certo', () => {
  const job = (over: any = {}) => ({ data: { sessionId: SID, tenantId: TENANT, conversationId: 'cv1', jid: JID, content: 'Resposta', messageId: 'msg-1', ...over }, attemptsMade: 0, opts: { attempts: 2 } });

  it('sessão CLOUD_API → Graph API (sem socket do Baileys) e grava o wamid', async () => {
    const res = await outbound(job({ automatic: true }) as any);
    expect(res).toMatchObject({ success: true, sentId: expect.stringMatching(/^wamid\./) });
    expect(sentBodies()[0].body).toMatchObject({ to: CUSTOMER, text: { body: 'Resposta' } });
    const upd = mockPrisma.message.update.mock.calls.find((c: any[]) => c[0].where.id === 'msg-1')[0];
    expect(upd.data.metadata).toMatchObject({ status: 'sent', waMessageId: expect.stringMatching(/^wamid\./) });
    // coluna própria (indexada) com o mesmo wamid
    expect(upd.data.waMessageId).toBe(upd.data.metadata.waMessageId);
    expect(makeWASocket).not.toHaveBeenCalled();
  });

  it('IA/saudação fora da janela: bloqueada sem chamar a Meta + nota ao operador, sem nova tentativa', async () => {
    lastCustomerAt = new Date(Date.now() - 30 * 3600_000);
    const res = await outbound(job({ automatic: true }) as any);
    expect(res).toMatchObject({ success: false, cloudRejected: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.message.update).toHaveBeenCalledWith({ where: { id: 'msg-1' }, data: { metadata: expect.objectContaining({ status: 'blocked' }) } });
    expect(mockPrisma.message.create.mock.calls.some((c: any[]) => c[0].data.role === 'SYSTEM' && /24h/.test(c[0].data.content))).toBe(true);
  });

  it('modelo do operador (job com template) sai pela API oficial', async () => {
    lastCustomerAt = null;
    await outbound(job({ template: { name: 'retorno', language: 'pt_BR', bodyParams: ['Maria'] } }) as any);
    expect(sentBodies()[0].body).toMatchObject({ type: 'template' });
  });

  it('erro da Meta (131026): falha definitiva em português, sem repetir', async () => {
    fetchMock.mockImplementation(async () => json(400, { error: { code: 131026, message: 'Message undeliverable' } }));
    const res = await outbound(job() as any);
    expect(res).toMatchObject({ success: false, cloudRejected: true });
    expect(mockPrisma.message.update).toHaveBeenCalledWith({ where: { id: 'msg-1' }, data: { metadata: expect.objectContaining({ status: 'failed', errorCode: 131026 }) } });
  });

  it('sessão BAILEYS → caminho do QR Code intacto (socket, presença, sendMessage) — nada na Graph API', async () => {
    h.rows = [cloudRow({ id: 'db-qr', sessionId: 'qr1', provider: 'BAILEYS', cloudPhoneNumberId: null, cloudConfig: null })];
    const dir = path.join(h.authDir, 'qr1');
    fs.mkdirSync(dir, { recursive: true });
    await wa.startBaileysSession(TENANT, 'db-qr', 'qr1', dir);
    const sock = h.sockets.at(-1);
    const p = processOutboundJob(job({ sessionId: 'qr1', automatic: true }) as any);
    await vi.advanceTimersByTimeAsync(20_000);
    const res = await p;
    expect(res).toMatchObject({ success: true });
    expect(sock.presenceSubscribe).toHaveBeenCalled();
    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('composing', JID);
    expect(sock.sendMessage).toHaveBeenCalledWith(JID, { text: 'Resposta' }, expect.objectContaining({ messageId: expect.any(String) }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('operador: janela e modelo aprovado', () => {
  function setupConversation(lastAt: Date | null) {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: 'cv1', tenantId: TENANT, channel: 'WHATSAPP', status: 'ACTIVE', assignedTo: null, contactPhone: CUSTOMER, contactId: null,
      lastCustomerMessageAt: lastAt, whatsappSession: { sessionId: SID, provider: 'CLOUD_API' }, ticket: null, agent: {},
    });
    mockPrisma.ticket.findUnique.mockResolvedValue(null);
    mockPrisma.conversation.update.mockResolvedValue({ id: 'cv1', status: 'HUMAN_TAKEOVER' });
    fetchMock.mockImplementation(async () => json(200, { data: [
      { name: 'retorno', language: 'pt_BR', status: 'APPROVED', components: [{ type: 'BODY', text: 'Oi {{1}}, podemos continuar?' }] },
      { name: 'com_foto', language: 'pt_BR', status: 'APPROVED', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'x' }] },
    ] }));
  }

  it('situação da janela para o painel do operador', async () => {
    setupConversation(new Date(Date.now() - 26 * 3600_000));
    expect(await cloud.getConversationWindow(TENANT, 'cv1')).toMatchObject({
      provider: 'CLOUD_API', insideWindow: false, message: 'Fora da janela de 24h — use um modelo aprovado.',
    });
  });

  it('lista só modelos aprovados que o sistema consegue enviar (cache de 1 h no Redis)', async () => {
    setupConversation(null);
    const list = await cloud.listConversationTemplates(TENANT, 'cv1');
    expect(list.map((t) => t.name)).toEqual(['retorno']);
    await cloud.listConversationTemplates(TENANT, 'cv1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('envia o modelo: grava o texto, IA sai da conversa e o job leva o modelo para a fila de saída', async () => {
    setupConversation(null);
    const msg: any = await cloud.sendConversationTemplate(TENANT, 'cv1', 'u1', { name: 'retorno', language: 'pt_BR', params: ['Maria'] });
    expect(msg.content).toBe('Oi Maria, podemos continuar?');
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'cv1' }, data: { status: 'HUMAN_TAKEOVER', assignedTo: 'u1' } });
    expect(mocks.outboundAdd).toHaveBeenCalledWith('send', expect.objectContaining({
      sessionId: SID, jid: JID, template: { name: 'retorno', language: 'pt_BR', bodyParams: ['Maria'], paramNames: null },
    }), { jobId: `out-${msg.id}` });
    await expect(cloud.sendConversationTemplate(TENANT, 'cv1', 'u1', { name: 'retorno', language: 'pt_BR', params: [] })).rejects.toThrow(/variável/);
  });
});

describe('cadastro e teste do número oficial', () => {
  it('cria (limite de plano vale), testa na Meta e nunca devolve token/App Secret', async () => {
    h.rows = [];
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT, maxWhatsapp: 2 });
    mockPrisma.whatsAppSession.count.mockResolvedValue(1);
    mockPrisma.whatsAppSession.findFirst.mockImplementation(async ({ where }: any) =>
      (where.cloudPhoneNumberId ? null : h.rows.find((r) => r.id === where.id) ?? null));
    mockPrisma.whatsAppSession.create.mockImplementation(async ({ data }: any) => {
      const row = { id: DB_ID, linkedAt: null, ...data };
      h.rows.push(row);
      return row;
    });
    mockPrisma.whatsAppSession.update.mockImplementation(async ({ where, data }: any) => {
      const row = h.rows.find((r) => r.id === where.id);
      Object.assign(row, data);
      return row;
    });
    fetchMock.mockImplementation(async () => json(200, {
      display_phone_number: '+55 11 3000-0000', verified_name: 'Loja X', quality_rating: 'GREEN', messaging_limit_tier: 'TIER_1K',
    }));
    const out = await cloud.createCloudSession(TENANT, { phoneNumberId: PNID, wabaId: '99887766', accessToken: TOKEN, appSecret: SECRET });
    expect(out.ok).toBe(true);
    const session: any = out.session;
    expect(session.status).toBe('CONNECTED');
    expect(session.provider).toBe('CLOUD_API');
    expect(session.cloud).toMatchObject({ verifiedName: 'Loja X', qualityRating: 'GREEN', messagingLimitTier: 'TIER_1K', accessToken: { configured: true, last4: '••••0001' } });
    expect(session.cloudConfig).toBeUndefined();
    const text = JSON.stringify(out);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('accessTokenEnc');
    // credenciais salvas cifradas
    expect(h.rows[0].cloudConfig.accessTokenEnc).not.toContain(TOKEN);
    expect(makeWASocket).not.toHaveBeenCalled();
  });

  it('limite de números do plano: o oficial conta junto com os de QR Code', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT, maxWhatsapp: 1 });
    mockPrisma.whatsAppSession.count.mockResolvedValue(1);
    await expect(cloud.createCloudSession(TENANT, { phoneNumberId: '999', wabaId: '99887766', accessToken: TOKEN, appSecret: SECRET }))
      .rejects.toThrow();
    await expect(cloud.createCloudSession(TENANT, { phoneNumberId: '99999', wabaId: '99887766', accessToken: TOKEN, appSecret: SECRET }))
      .rejects.toThrow(/Limite de números/);
  });

  it('token inválido (190): número fica desconectado com explicação em português', async () => {
    mockPrisma.whatsAppSession.findFirst.mockImplementation(async () => h.rows[0]);
    fetchMock.mockImplementation(async () => json(401, { error: { code: 190, message: 'Invalid OAuth access token' } }));
    const out = await cloud.testCloudSession(TENANT, DB_ID);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/token de acesso/i);
    expect(mockPrisma.whatsAppSession.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DISCONNECTED' }) }));
  });

  it('a URL do webhook só aparece com HTTPS (senão, alerta de domínio)', () => {
    const prev = process.env.PUBLIC_URL;
    process.env.PUBLIC_URL = 'http://203.0.113.10';
    expect(cloud.cloudPublicInfo(cloudRow()).webhookUrl).toBeNull();
    expect(cloud.cloudPublicInfo(cloudRow()).httpsReady).toBe(false);
    process.env.PUBLIC_URL = 'https://atendia.minhaempresa.com.br/';
    expect(cloud.cloudPublicInfo(cloudRow()).webhookUrl).toBe(`https://atendia.minhaempresa.com.br/api/whatsapp/cloud/webhook/${DB_ID}`);
    expect(cloud.cloudPublicInfo(cloudRow()).verifyToken).toBe('verify-tok-123');
    if (prev === undefined) delete process.env.PUBLIC_URL; else process.env.PUBLIC_URL = prev;
  });

  it('"reconectar" num número oficial não abre socket do Baileys', async () => {
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue(cloudRow());
    await expect(wa.reconnectSession(TENANT, DB_ID)).rejects.toThrow(/Testar conexão/);
    expect(makeWASocket).not.toHaveBeenCalled();
  });
});

describe('regressão — o caminho do QR Code (Baileys) não mudou', () => {
  const incoming = (id: string, text: string) => ({
    key: { remoteJid: JID, fromMe: false, id }, message: { conversation: text }, pushName: 'Maria',
    messageTimestamp: Math.floor(Date.now() / 1000) - 5,
  });
  const ctxQr = () => ({ tenantId: TENANT, dbSessionId: 'db-in', sessionId: 'in', authDir: '', sock: createFakeSock(), state: { creds: {} } }) as any;

  it('mensagem do QR Code não grava janela de 24 h nem baixa mídia pela Graph API', async () => {
    setupIncoming();
    await wa.handleIncomingMessage(ctxQr(), incoming('Q1', 'oi'));
    expect(mocks.scheduleAiResponse).toHaveBeenCalledTimes(1);
    const windowWrites = mockPrisma.conversation.update.mock.calls.filter((c: any[]) => 'lastCustomerMessageAt' in (c[0].data || {}));
    expect(windowWrites).toHaveLength(0);
    expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('boot: sessões oficiais não abrem socket nem são marcadas como desconectadas por falta de pasta', async () => {
    const list = [cloudRow({ status: 'CONNECTED' })];
    mockPrisma.whatsAppSession.findMany.mockImplementation(async (a: any) => (a.where.restrictedUntil ? [] : list));
    const count = await wa.reconnectAllSessions(() => 0);
    expect(count).toBe(0);
    expect(mockPrisma.whatsAppSession.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: DB_ID } }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(makeWASocket).not.toHaveBeenCalled();
  });

  it('limpeza de órfãs: apaga sessão de QR sem pasta, mas nunca a oficial', async () => {
    mockPrisma.whatsAppSession.findMany.mockResolvedValue([
      cloudRow({ status: 'DISCONNECTED' }),
      { id: 'db-orfa', sessionId: 'orfa-sem-pasta', tenantId: TENANT, status: 'DISCONNECTED', provider: 'BAILEYS' },
    ]);
    const cleaned = await wa.cleanupOrphanSessions(TENANT);
    expect(cleaned).toBe(1);
    expect(mockPrisma.whatsAppSession.delete).toHaveBeenCalledWith({ where: { id: 'db-orfa' } });
    expect(mockPrisma.whatsAppSession.delete).not.toHaveBeenCalledWith({ where: { id: DB_ID } });
  });

  it('rota da conversa: sem provider para o QR Code (consumidores seguem o caminho antigo)', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      channel: 'WHATSAPP', contactPhone: CUSTOMER, contactId: null, whatsappSession: { sessionId: 'qr1', provider: 'BAILEYS' }, ticket: null,
    });
    expect(await wa.resolveConversationRoute(TENANT, 'cv1')).toEqual({ sessionId: 'qr1', jid: JID });
    mockPrisma.conversation.findFirst.mockResolvedValue({
      channel: 'WHATSAPP', contactPhone: CUSTOMER, contactId: null, whatsappSession: { sessionId: SID, provider: 'CLOUD_API' }, ticket: null,
    });
    expect(await wa.resolveConversationRoute(TENANT, 'cv1')).toEqual({ sessionId: SID, jid: JID, provider: 'CLOUD_API' });
  });

  it('restrição do QR Code (463) continua com o texto e o alerta originais', async () => {
    await wa.restrictSession(TENANT, 'db-qr', 'qrx', '463');
    const ev = h.emitted.find((e) => e.event === 'whatsapp:restricted');
    expect(ev?.payload.message).toBe('O WhatsApp limitou temporariamente este número; envios automáticos pausados por 24h.');
  });
});

describe('correções da auditoria', () => {
  it('P2-6: webhook atrasado não faz a janela retroceder; falha ao gravar é registrada (não engolida)', async () => {
    setupIncoming();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockPrisma.conversation.updateMany.mockRejectedValueOnce(new Error('banco fora'));
    await run(webhookBody([textMsg('wamid.W1', 'oi')]));
    expect(err.mock.calls.some((c) => String(c[0]).includes('janela de 24 h'))).toBe(true);
    // a mensagem continua sendo atendida
    expect(mocks.scheduleAiResponse).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it('P1-A: status de entrega acha a mensagem pela coluna waMessageId (sem varrer metadata)', async () => {
    mockPrisma.message.findFirst.mockResolvedValueOnce({ id: 'mCol', conversationId: 'cv1', metadata: {} });
    await run(webhookBody([], { statuses: [{ id: 'wamid.COL', status: 'delivered' }] }));
    expect(mockPrisma.message.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.message.findFirst.mock.calls[0][0].where).toEqual({ waMessageId: 'wamid.COL', conversation: { tenantId: TENANT } });
    expect(mockPrisma.message.update).toHaveBeenCalledWith({ where: { id: 'mCol' }, data: { metadata: { deliveryStatus: 'delivered' } } });
  });

  it('P1-A: mensagem antiga (sem coluna) só é procurada em metadata nas últimas 48 h e neste número', async () => {
    mockPrisma.message.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'mOld', conversationId: 'cv1', metadata: { waMessageId: 'wamid.OLD' } });
    await run(webhookBody([], { statuses: [{ id: 'wamid.OLD', status: 'read' }] }));
    const legacy = mockPrisma.message.findFirst.mock.calls[1][0].where;
    expect(legacy).toMatchObject({
      waMessageId: null,
      conversation: { tenantId: TENANT, whatsappSessionId: DB_ID },
      metadata: { path: ['waMessageId'], equals: 'wamid.OLD' },
    });
    expect(Date.now() - legacy.createdAt.gte.getTime()).toBe(48 * 3600_000);
    expect(mockPrisma.message.update).toHaveBeenCalledWith({ where: { id: 'mOld' }, data: { metadata: expect.objectContaining({ deliveryStatus: 'read' }) } });
  });

  it('P2-3: assinatura inválida é contada por sessão (24 h) e aparece no resumo do número', async () => {
    const body = webhookBody([textMsg('wamid.B', 'oi')]);
    const raw = Buffer.from(JSON.stringify(body));
    for (let i = 0; i < 3; i++) await cloud.receiveWebhook(DB_ID, raw, computeSignature(raw, 'segredo-errado-000000000000000'), body);
    expect(await cloud.getInvalidSignatureCount(DB_ID)).toBe(3);
    const withStats: any = await cloud.attachCloudStats(cloud.toPublicSession(cloudRow()));
    expect(withStats.cloud.invalidSignatures24h).toBe(3);
    vi.setSystemTime(Date.now() + 24 * 3600_000 + 1000);
    expect(await cloud.getInvalidSignatureCount(DB_ID)).toBe(0);
  });

  it('P2-4: quem não é OWNER/ADMIN vê só { provider, status, quality } da conexão oficial', () => {
    const limited: any = cloud.limitCloudForNonAdmin(cloud.toPublicSession(cloudRow({ cloudConfig: { ...cloudRow().cloudConfig, qualityRating: 'GREEN' } })));
    expect(limited.cloud).toEqual({ provider: 'CLOUD_API', status: 'CONNECTED', quality: 'GREEN' });
    const text = JSON.stringify(limited);
    expect(text).not.toContain('verify-tok-123');
    expect(text).not.toContain('99887766');
    expect(text).not.toContain('accessToken');
    // QR Code: nada muda
    const qr = { id: 'x', provider: 'BAILEYS', status: 'CONNECTED' };
    expect(cloud.limitCloudForNonAdmin(qr)).toBe(qr);
  });

  it('P2-1: campanha por modelo no número oficial NÃO conta no teto diário de 1500; QR Code continua contando', async () => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    await settle(wa.sendCloudCampaignTemplate(SID, CUSTOMER, { name: 'promo', language: 'pt_BR', bodyParams: ['Maria'] }, 'campaign-d1'));
    expect(await h.fakeRedis.current.get(`wa:auto:day:${SID}:${day}`)).toBeNull();
    // automáticas do número oficial (IA/saudação) continuam contando
    await wa.reserveAutomaticSend(SID, 'auto');
    expect(await h.fakeRedis.current.get(`wa:auto:day:${SID}:${day}`)).toBe('1');
    // QR Code: campanha conta no diário como sempre
    await wa.reserveAutomaticSend('qr-daily', 'campaign');
    expect(await h.fakeRedis.current.get(`wa:auto:day:qr-daily:${day}`)).toBe('1');
  });
});

describe('P2-2: só grava o número oficial se o teste com a Meta passar', () => {
  function setupCreate() {
    h.rows = [];
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT, maxWhatsapp: 5 });
    mockPrisma.whatsAppSession.count.mockResolvedValue(0);
    mockPrisma.whatsAppSession.create.mockImplementation(async ({ data }: any) => {
      const row = { id: DB_ID, linkedAt: null, lastConnectedAt: null, ...data };
      h.rows.push(row);
      return row;
    });
    mockPrisma.whatsAppSession.update.mockImplementation(async ({ where, data }: any) => {
      const row = h.rows.find((r) => r.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    });
  }
  const body = { phoneNumberId: PNID, wabaId: '99887766', accessToken: TOKEN, appSecret: SECRET };

  it('token inválido: nada é gravado (o Phone Number ID não fica preso)', async () => {
    setupCreate();
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue(null);
    fetchMock.mockImplementation(async () => json(401, { error: { code: 190, message: 'Invalid OAuth access token' } }));
    await expect(cloud.createCloudSession(TENANT, body)).rejects.toThrow(/Não salvamos: .*token de acesso/i);
    expect(mockPrisma.whatsAppSession.create).not.toHaveBeenCalled();
  });

  it('sessão DESCONECTADA que nunca funcionou libera o Phone Number ID para o novo cadastro', async () => {
    setupCreate();
    const squatter = { id: 'db-squat', sessionId: 'wacloud_x', status: 'DISCONNECTED', lastConnectedAt: null, cloudConfig: { lastTestOk: false } };
    mockPrisma.whatsAppSession.findFirst.mockImplementation(async ({ where }: any) => (where.cloudPhoneNumberId ? squatter : h.rows.find((r) => r.id === where.id) ?? null));
    fetchMock.mockImplementation(async () => json(200, { display_phone_number: '+55 11 3000-0000', verified_name: 'Loja X', quality_rating: 'GREEN' }));
    const out = await cloud.createCloudSession(TENANT, body);
    expect(out.ok).toBe(true);
    expect(mockPrisma.whatsAppSession.update).toHaveBeenCalledWith({ where: { id: 'db-squat' }, data: { cloudPhoneNumberId: null } });
  });

  it('número em uso por sessão que já funcionou: conflito (nada gravado)', async () => {
    setupCreate();
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'db-ok', sessionId: 's', status: 'DISCONNECTED', lastConnectedAt: new Date(), cloudConfig: { lastTestOk: true } });
    fetchMock.mockImplementation(async () => json(200, { display_phone_number: '+55 11 3000-0000' }));
    await expect(cloud.createCloudSession(TENANT, body)).rejects.toThrow(/já está cadastrado/);
    expect(mockPrisma.whatsAppSession.create).not.toHaveBeenCalled();
  });

  it('corrida no cadastro (índice único): conflito em português', async () => {
    setupCreate();
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue(null);
    mockPrisma.whatsAppSession.create.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    fetchMock.mockImplementation(async () => json(200, { display_phone_number: '+55 11 3000-0000' }));
    await expect(cloud.createCloudSession(TENANT, body)).rejects.toThrow(/já está cadastrado/);
  });

  it('edição com token novo inválido: nada muda no banco', async () => {
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue(cloudRow());
    fetchMock.mockImplementation(async () => json(401, { error: { code: 190, message: 'Invalid' } }));
    await expect(cloud.updateCloudSession(TENANT, DB_ID, { accessToken: 'EAAG-token-novo-mas-invalido-9' })).rejects.toThrow(/Não salvamos/);
    expect(mockPrisma.whatsAppSession.update).not.toHaveBeenCalled();
  });
});
