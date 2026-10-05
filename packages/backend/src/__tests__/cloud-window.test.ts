/**
 * API oficial (Cloud API) — janela de 24 h aplicada à IA e ao operador, e campanha do número
 * oficial exigindo modelo aprovado. O caminho do QR Code segue igual (mesmos testes, sem provider).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeRedis } from './helpers/fake-redis.js';

const { h, mockPrisma, mocks } = vi.hoisted(() => {
  process.env.SESSION_ENCRYPTION_KEY = 'z'.repeat(40);
  return {
    h: { fakeRedis: { current: null as any }, emitted: [] as any[] },
    mockPrisma: {
      conversation: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
      whatsAppSession: { findUnique: vi.fn(), findFirst: vi.fn() },
      message: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
      ticket: { findUnique: vi.fn(), update: vi.fn() },
      contact: { findMany: vi.fn() },
      campaign: { create: vi.fn() },
    },
    mocks: {
      generateResponse: vi.fn(),
      resolveConversationRoute: vi.fn(),
      getActiveSocket: vi.fn(),
      isWithinBusinessHours: vi.fn(),
      outboundAdd: vi.fn(),
      aiQueueAdd: vi.fn(),
      offhoursAdd: vi.fn(),
      campaignAdd: vi.fn(),
    },
  };
});

vi.mock('bullmq', () => ({ Worker: vi.fn(() => ({ on: vi.fn() })), Queue: vi.fn() }));
vi.mock('../lib/redis.js', () => ({
  default: new Proxy({}, { get: (_t, prop) => (h.fakeRedis.current as any)[prop] }),
}));
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/socket.js', () => ({
  getIO: () => ({ to: (room: string) => ({ emit: (event: string, payload: any) => h.emitted.push({ room, event, payload }) }) }),
}));
vi.mock('../services/ai.service.js', () => ({ generateResponse: mocks.generateResponse }));
vi.mock('../services/whatsapp.service.js', () => ({
  resolveConversationRoute: mocks.resolveConversationRoute,
  getActiveSocket: mocks.getActiveSocket,
}));
vi.mock('../services/business-hours.service.js', () => ({ isWithinBusinessHours: mocks.isWithinBusinessHours }));
vi.mock('../services/voice.service.js', () => ({ generateAudioResponse: vi.fn(), MAX_TTS_CHARS: 600, mediaExtension: () => 'bin' }));
vi.mock('../services/ticket.service.js', () => ({ updateTicket: vi.fn(), closeTicket: vi.fn(), reopenTicket: vi.fn() }));
vi.mock('../workers/queues.js', () => ({
  whatsappOutboundQueue: { add: mocks.outboundAdd },
  aiResponseQueue: { add: mocks.aiQueueAdd, getJob: vi.fn() },
  offhoursMessageQueue: { add: mocks.offhoursAdd },
  campaignQueue: { add: mocks.campaignAdd },
  whatsappCloudWebhookQueue: { add: vi.fn() },
}));

import { processAiResponseJob } from '../workers/ai-response.worker.js';
import { sendMessage } from '../services/conversation.service.js';
import { createCampaign } from '../services/campaign.service.js';
import { encryptSecret } from '../lib/secret-box.js';
import { invalidateProviderCache } from '../lib/wa-provider.js';
import { _resetRestrictionCache } from '../lib/wa-guards.js';
import { ValidationError } from '../lib/errors.js';

const TENANT = 't1';
const SID = 'wacloud_t1_x';
const agent = { id: 'ag1', name: 'Bot', isActive: true, responseDelayMinMs: 0, responseDelayMaxMs: 0, sendAudioFrequency: 0, voiceProfile: null };
let lastCustomerAt: Date | null;

const cloudSessionRow = {
  id: 'db-cloud', sessionId: SID, tenantId: TENANT, status: 'CONNECTED', provider: 'CLOUD_API', cloudPhoneNumberId: '1234567890',
  campaignsDisabledAt: null,
  cloudConfig: { wabaId: '99887766', accessTokenEnc: encryptSecret('EAAG-token-de-teste-0001'), appSecretEnc: encryptSecret('abcdef0123456789abcdef0123456789') },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  h.fakeRedis.current = createFakeRedis();
  h.emitted.length = 0;
  invalidateProviderCache();
  _resetRestrictionCache();
  lastCustomerAt = new Date(Date.now() - 3600_000);
  mockPrisma.whatsAppSession.findUnique.mockImplementation(async ({ where }: any) =>
    (where.sessionId === SID ? cloudSessionRow : { restrictedUntil: null }));
  mockPrisma.conversation.findFirst.mockImplementation(async (args: any) => {
    if (args?.select) return { status: 'ACTIVE', agent: { isActive: true } };
    return {
      id: 'cv1', tenantId: TENANT, channel: 'WHATSAPP', status: 'ACTIVE', agentId: 'ag1', assignedTo: null,
      lastCustomerMessageAt: lastCustomerAt, agent,
    };
  });
  mockPrisma.conversation.update.mockImplementation(async ({ data }: any) => ({ id: 'cv1', ...data }));
  mockPrisma.message.findFirst.mockImplementation(async (args: any) => (args?.where?.metadata ? null : { id: 'm1' }));
  mockPrisma.message.findMany.mockResolvedValue([{ role: 'USER', content: 'oi' }]);
  mockPrisma.message.create.mockImplementation(async ({ data }: any) => ({ id: 'new-' + Math.random(), ...data }));
  mockPrisma.ticket.findUnique.mockResolvedValue(null);
  mocks.generateResponse.mockResolvedValue('Olá!');
  mocks.isWithinBusinessHours.mockResolvedValue(true);
  mocks.getActiveSocket.mockReturnValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });

async function runAi() {
  const p = processAiResponseJob({ data: { tenantId: TENANT, conversationId: 'cv1', agentId: 'ag1', triggerMessageId: 'm1' } } as any);
  await vi.runAllTimersAsync();
  return p;
}

describe('IA e janela de 24 h (API oficial)', () => {
  it('fora da janela: a IA nem gera resposta (não gasta IA, não tenta enviar)', async () => {
    mocks.resolveConversationRoute.mockResolvedValue({ sessionId: SID, jid: '5511@s.whatsapp.net', provider: 'CLOUD_API' });
    lastCustomerAt = new Date(Date.now() - 25 * 3600_000);
    expect(await runAi()).toEqual({ skipped: 'outside_window' });
    expect(mocks.generateResponse).not.toHaveBeenCalled();
    expect(mocks.outboundAdd).not.toHaveBeenCalled();
  });

  it('dentro da janela: responde normalmente pela fila de saída', async () => {
    mocks.resolveConversationRoute.mockResolvedValue({ sessionId: SID, jid: '5511@s.whatsapp.net', provider: 'CLOUD_API' });
    await runAi();
    expect(mocks.generateResponse).toHaveBeenCalled();
    expect(mocks.outboundAdd).toHaveBeenCalledWith('send', expect.objectContaining({ sessionId: SID, automatic: true }), expect.any(Object));
  });

  it('QR Code (sem provider na rota): a janela de 24 h NÃO se aplica', async () => {
    mocks.resolveConversationRoute.mockResolvedValue({ sessionId: 'qr1', jid: '5511@s.whatsapp.net' });
    lastCustomerAt = null;
    await runAi();
    expect(mocks.outboundAdd).toHaveBeenCalledTimes(1);
  });
});

describe('operador e janela de 24 h (API oficial)', () => {
  it('fora da janela: aviso claro e nada gravado/enfileirado', async () => {
    mocks.resolveConversationRoute.mockResolvedValue({ sessionId: SID, jid: '5511@s.whatsapp.net', provider: 'CLOUD_API' });
    lastCustomerAt = new Date(Date.now() - 30 * 3600_000);
    const err = await sendMessage(TENANT, 'cv1', { content: 'Oi', role: 'ASSISTANT' } as any, 'u1').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toBe('Fora da janela de 24h — use um modelo aprovado.');
    expect(err.errors).toEqual(['OUTSIDE_WINDOW']);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(mocks.outboundAdd).not.toHaveBeenCalled();
  });

  it('dentro da janela: envia sem precisar de socket (número oficial)', async () => {
    mocks.resolveConversationRoute.mockResolvedValue({ sessionId: SID, jid: '5511@s.whatsapp.net', provider: 'CLOUD_API' });
    await sendMessage(TENANT, 'cv1', { content: 'Oi', role: 'ASSISTANT' } as any, 'u1');
    expect(mocks.outboundAdd).toHaveBeenCalledWith('send', expect.objectContaining({ sessionId: SID, content: 'Oi' }), expect.any(Object));
    expect(mocks.getActiveSocket).not.toHaveBeenCalled();
  });

  it('número oficial desconectado: erro claro', async () => {
    mocks.resolveConversationRoute.mockResolvedValue({ sessionId: SID, jid: '5511@s.whatsapp.net', provider: 'CLOUD_API' });
    mockPrisma.whatsAppSession.findUnique.mockResolvedValue({ ...cloudSessionRow, status: 'DISCONNECTED' });
    await expect(sendMessage(TENANT, 'cv1', { content: 'Oi', role: 'ASSISTANT' } as any, 'u1')).rejects.toThrow(/desconectado/);
  });

  it('QR Code: continua exigindo o socket aberto (sem mudança)', async () => {
    mocks.resolveConversationRoute.mockResolvedValue({ sessionId: 'qr1', jid: '5511@s.whatsapp.net' });
    await expect(sendMessage(TENANT, 'cv1', { content: 'Oi', role: 'ASSISTANT' } as any, 'u1')).rejects.toThrow(/Reconecte-o/);
    mocks.getActiveSocket.mockReturnValue({});
    lastCustomerAt = null; // janela não vale para o QR Code
    await sendMessage(TENANT, 'cv1', { content: 'Oi', role: 'ASSISTANT' } as any, 'u1');
    expect(mocks.outboundAdd).toHaveBeenCalledTimes(1);
  });
});

describe('campanha pelo número oficial: só com modelo aprovado', () => {
  function setupCampaign() {
    mockPrisma.contact.findMany
      .mockResolvedValueOnce([{ id: 'c1' }])
      .mockResolvedValueOnce([{ id: 'c1', name: 'Maria', phone: '5511988887777', lid: null }]);
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue(cloudSessionRow);
    mockPrisma.conversation.findMany.mockResolvedValue([{ contactId: 'c1', contactPhone: '5511988887777' }]);
    mockPrisma.campaign.create.mockImplementation(async ({ data }: any) => ({ id: 'camp-1', ...data }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [
      { name: 'promo', language: 'pt_BR', status: 'APPROVED', components: [{ type: 'BODY', text: 'Olá {{1}}, temos novidades!' }] },
      { name: 'pendente', language: 'pt_BR', status: 'PENDING', components: [{ type: 'BODY', text: 'x' }] },
    ] }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  }
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sem modelo: recusa (texto livre não é permitido pela Meta)', async () => {
    setupCampaign();
    await expect(createCampaign(TENANT, 'Promo', 'Oi {nome}', ['c1'], undefined, 'db-cloud')).rejects.toThrow(/modelo aprovado/);
  });

  it('modelo não aprovado ou variável vazia: recusa', async () => {
    setupCampaign();
    await expect(createCampaign(TENANT, 'Promo', '', ['c1'], undefined, 'db-cloud', { name: 'pendente', language: 'pt_BR' })).rejects.toThrow(/não encontrado/);
    setupCampaign();
    await expect(createCampaign(TENANT, 'Promo', '', ['c1'], undefined, 'db-cloud', { name: 'promo', language: 'pt_BR', params: [] })).rejects.toThrow(/\{\{1\}\}/);
  });

  it('modelo aprovado + {nome}: grava modelo, idioma e mapeamento (sem exigir spintax)', async () => {
    setupCampaign();
    const result: any = await createCampaign(TENANT, 'Promo', '', ['c1'], undefined, 'db-cloud', {
      name: 'promo', language: 'pt_BR', params: [{ name: '1', value: '{nome}' }],
    });
    expect(mockPrisma.campaign.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        templateName: 'promo', templateLanguage: 'pt_BR', templateParams: [{ name: '1', value: '{nome}' }],
        message: 'Olá {{1}}, temos novidades!', whatsappSessionId: 'db-cloud', totalRecipients: 1,
      }),
    }));
    expect(result.warnings).toEqual([]);
  });

  it('QR Code: continua exigindo {nome} ou variação (regra anti-banimento intacta)', async () => {
    setupCampaign();
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'db-qr', campaignsDisabledAt: null, provider: 'BAILEYS' });
    await expect(createCampaign(TENANT, 'Promo', 'Mensagem igual para todos', ['c1'], undefined, 'db-qr')).rejects.toThrow(/idêntica/);
  });
});
