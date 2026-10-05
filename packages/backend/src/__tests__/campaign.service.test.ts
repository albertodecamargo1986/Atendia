import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeRedis } from './helpers/fake-redis.js';

const { h, mockPrisma, mockQueue, emitted } = vi.hoisted(() => ({
  h: { fakeRedis: { current: null as any } },
  mockPrisma: {
    contact: { findMany: vi.fn() },
    conversation: { findMany: vi.fn(), findFirst: vi.fn() },
    whatsAppSession: { findFirst: vi.fn(), findUnique: vi.fn() },
    campaign: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    campaignContact: { count: vi.fn() },
  },
  mockQueue: { add: vi.fn() },
  emitted: [] as any[],
}));

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/redis.js', () => ({
  default: new Proxy({}, { get: (_t, prop) => (h.fakeRedis.current as any)[prop] }),
}));
vi.mock('../workers/queues.js', () => ({ campaignQueue: mockQueue }));
vi.mock('../lib/socket.js', () => ({
  getIO: () => ({ to: () => ({ emit: (event: string, payload: any) => emitted.push({ event, payload }) }) }),
}));

import {
  createCampaign, startCampaign, cancelCampaign, pauseCampaign, getEligibleContacts, checkCampaignCompletion,
  validateCampaignMessage, shouldKillCampaign, recordCampaignOutcome, isRecipientStillEligible, isLidOnlyContact,
  CAMPAIGN_RULES,
} from '../services/campaign.service.js';
import { ValidationError, ConflictError } from '../lib/errors.js';

const tenantId = 'tenant-1';

/** Conversas "no banco": o mock aplica o filtro por número (OR whatsappSessionId / null). */
let conversations: Array<{ contactId: string | null; contactPhone: string; whatsappSessionId: string | null }> = [];
function useConversations(list: typeof conversations) {
  conversations = list;
  mockPrisma.conversation.findMany.mockImplementation(async ({ where }: any) => {
    const allowed: Array<string | null> = (where.OR || []).map((o: any) => o.whatsappSessionId);
    return conversations.filter((c) => allowed.includes(c.whatsappSessionId));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  emitted.length = 0;
  h.fakeRedis.current = createFakeRedis();
  mockPrisma.campaign.update.mockResolvedValue({});
  useConversations([]);
});

describe('campaign.service — quem pode receber (por NÚMERO)', () => {
  it('só quem conversou com ESTE número (ou conversa legada sem número) nos últimos 90 dias e sem opt-out', async () => {
    useConversations([
      { contactId: 'c1', contactPhone: '551', whatsappSessionId: 'B' },
      { contactId: null, contactPhone: '552', whatsappSessionId: null }, // legado: vale
      { contactId: 'c3', contactPhone: '553', whatsappSessionId: 'A' }, // só falou com o número A
    ]);
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: 'c1', name: 'A', phone: '551', lid: null },
      { id: 'c2', name: 'B', phone: '552', lid: null },
      { id: 'c3', name: 'C', phone: '553', lid: null },
    ]);
    const eligible = await getEligibleContacts(tenantId, undefined, 'B');
    expect(eligible.map((c) => c.id)).toEqual(['c1', 'c2']); // c3 fica fora da campanha do número B

    const convWhere = mockPrisma.conversation.findMany.mock.calls[0][0].where;
    expect(convWhere.OR).toEqual([{ whatsappSessionId: 'B' }, { whatsappSessionId: null }]);
    expect(convWhere.messages.some.role).toBe('USER');
    const since: Date = convWhere.messages.some.createdAt.gte;
    expect(Date.now() - since.getTime()).toBeGreaterThan(89 * 86_400_000);
    expect(Date.now() - since.getTime()).toBeLessThan(91 * 86_400_000);
    expect(mockPrisma.contact.findMany.mock.calls[0][0].where).toMatchObject({ tenantId, optedOutAt: null, isGroup: false });
  });

  it('contato cujo "telefone" veio de LID sem senderPn não é elegível', async () => {
    useConversations([{ contactId: 'c9', contactPhone: '99887766', whatsappSessionId: 'B' }]);
    mockPrisma.contact.findMany.mockResolvedValue([{ id: 'c9', name: 'Lid', phone: '99887766', lid: '99887766@lid' }]);
    expect(await getEligibleContacts(tenantId, undefined, 'B')).toEqual([]);
    expect(isLidOnlyContact({ phone: '5511988887777', lid: '99887766@lid' })).toBe(false);
  });

  it('revalidação no envio: opt-out, LID e falta de conversa recente com o número', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'cv' });
    expect(await isRecipientStillEligible(tenantId, { id: 'c1', phone: '551' }, 'B')).toBe(true);
    expect(mockPrisma.conversation.findFirst.mock.calls[0][0].where.AND[1]).toEqual({ OR: [{ whatsappSessionId: 'B' }, { whatsappSessionId: null }] });
    expect(await isRecipientStillEligible(tenantId, { id: 'c1', phone: '551', optedOutAt: new Date() }, 'B')).toBe(false);
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    expect(await isRecipientStillEligible(tenantId, { id: 'c1', phone: '551' }, 'B')).toBe(false);
  });

  it('palavras de opt-out divulgadas não incluem CANCELAR', () => {
    expect(CAMPAIGN_RULES.optOutKeywords).not.toContain('CANCELAR');
    expect(CAMPAIGN_RULES.optOutKeywords).toEqual(expect.arrayContaining(['SAIR', 'PARAR', 'PARE', 'STOP', 'NAO QUERO MAIS']));
  });
});

describe('campaign.service — texto da campanha', () => {
  it('texto idêntico para todos é recusado; {nome} ou spintax passam', () => {
    expect(() => validateCampaignMessage('Promoção de hoje!')).toThrow(ValidationError);
    expect(validateCampaignMessage('Oi {nome}, promoção!').warnings).toEqual([]);
    expect(validateCampaignMessage('{Olá|Oi}! promoção').warnings).toEqual([]);
  });

  it('link no texto gera aviso', () => {
    expect(validateCampaignMessage('Oi {nome}, veja https://loja.com/x').warnings[0]).toMatch(/link/i);
  });
});

describe('campaign.service — createCampaign', () => {
  it('rejeita contactIds de outro tenant (IDOR)', async () => {
    mockPrisma.contact.findMany.mockResolvedValueOnce([{ id: 'c-meu' }]);
    await expect(createCampaign(tenantId, 'Promo', 'Oi {nome}!', ['c-meu', 'c-de-outro-tenant'])).rejects.toThrow(ValidationError);
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('cria só com os elegíveis DO NÚMERO escolhido e informa quantos ficaram de fora', async () => {
    useConversations([{ contactId: 'c1', contactPhone: '551', whatsappSessionId: 'wa1' }]);
    mockPrisma.contact.findMany
      .mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }]) // IDOR
      .mockResolvedValueOnce([{ id: 'c1', name: 'A', phone: '551', lid: null }, { id: 'c2', name: 'B', phone: '552', lid: null }]);
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'wa1', campaignsDisabledAt: null });
    mockPrisma.campaign.create.mockImplementation(async ({ data }: any) => ({ id: 'camp-1', ...data }));

    const result = await createCampaign(tenantId, 'Promo', 'Oi {nome}', ['c1', 'c2', 'c1'], undefined, 'wa1');
    expect(mockPrisma.campaign.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalRecipients: 1, whatsappSessionId: 'wa1', recipients: { create: [{ contactId: 'c1' }] } }),
    }));
    expect(result.excludedCount).toBe(1);
    expect(mockPrisma.conversation.findMany.mock.calls.at(-1)[0].where.OR[0]).toEqual({ whatsappSessionId: 'wa1' });
  });

  it('sem número informado: usa o 1º conectado (sempre há um número definido)', async () => {
    useConversations([{ contactId: 'c1', contactPhone: '551', whatsappSessionId: 'wa-first' }]);
    mockPrisma.contact.findMany.mockResolvedValueOnce([{ id: 'c1' }]).mockResolvedValueOnce([{ id: 'c1', name: 'A', phone: '551', lid: null }]);
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'wa-first', campaignsDisabledAt: null });
    mockPrisma.campaign.create.mockImplementation(async ({ data }: any) => ({ id: 'camp-2', ...data }));
    await createCampaign(tenantId, 'Promo', 'Oi {nome}', ['c1']);
    expect(mockPrisma.campaign.create.mock.calls[0][0].data.whatsappSessionId).toBe('wa-first');
  });

  it('nenhum elegível: erro explicando a regra', async () => {
    mockPrisma.contact.findMany.mockResolvedValueOnce([{ id: 'c1' }]).mockResolvedValueOnce([{ id: 'c1', name: 'A', phone: '551', lid: null }]);
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'wa1', campaignsDisabledAt: null });
    await expect(createCampaign(tenantId, 'Promo', 'Oi {nome}', ['c1'], undefined, 'wa1')).rejects.toThrow(/90 dias/);
  });

  it('número de outro tenant é recusado', async () => {
    mockPrisma.contact.findMany.mockResolvedValueOnce([{ id: 'c1' }]);
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue(null);
    await expect(createCampaign(tenantId, 'Promo', 'Oi {nome}', ['c1'], undefined, 'wa-de-outro')).rejects.toThrow();
  });

  it('número com campanhas desligadas (2 restrições em 30 dias) é recusado', async () => {
    mockPrisma.contact.findMany.mockResolvedValueOnce([{ id: 'c1' }]);
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'wa1', campaignsDisabledAt: new Date() });
    await expect(createCampaign(tenantId, 'Promo', 'Oi {nome}', ['c1'], undefined, 'wa1')).rejects.toThrow(ConflictError);
  });
});

describe('campaign.service — iniciar, pausar, cancelar', () => {
  it('não inicia campanha CANCELLED', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: 'camp-1', status: 'CANCELLED' });
    await expect(startCampaign('camp-1', tenantId)).rejects.toThrow(ConflictError);
    expect(mockPrisma.campaign.update).not.toHaveBeenCalled();
  });

  it('uma campanha em envio por número (trava)', async () => {
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ campaignsDisabledAt: null, restrictedUntil: null });
    mockPrisma.campaign.findFirst
      .mockResolvedValueOnce({ id: 'camp-2', status: 'DRAFT', whatsappSessionId: 'wa1' })
      .mockResolvedValueOnce({ name: 'Outra' });
    await expect(startCampaign('camp-2', tenantId)).rejects.toThrow(/Já existe uma campanha em envio/);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('número limitado ou com campanhas desligadas não inicia campanha', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: 'c', status: 'PAUSED', whatsappSessionId: 'wa1' });
    mockPrisma.whatsAppSession.findFirst.mockResolvedValueOnce({ campaignsDisabledAt: null, restrictedUntil: new Date(Date.now() + 3600_000) });
    await expect(startCampaign('c', tenantId)).rejects.toThrow(/limitou/);
    mockPrisma.whatsAppSession.findFirst.mockResolvedValueOnce({ campaignsDisabledAt: new Date(), restrictedUntil: null });
    await expect(startCampaign('c', tenantId)).rejects.toThrow(/desligadas/);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('inicia com o 1º número conectado e UM tick (nada de atrasos pré-calculados)', async () => {
    mockPrisma.campaign.findFirst
      .mockResolvedValueOnce({ id: 'camp-3', status: 'DRAFT', whatsappSessionId: null, startedAt: null })
      .mockResolvedValueOnce(null);
    mockPrisma.whatsAppSession.findFirst
      .mockResolvedValueOnce({ id: 'wa9' })
      .mockResolvedValueOnce({ campaignsDisabledAt: null, restrictedUntil: null });
    await startCampaign('camp-3', tenantId);
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-3' },
      data: expect.objectContaining({ status: 'RUNNING', whatsappSessionId: 'wa9' }),
    });
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = mockQueue.add.mock.calls[0];
    expect(name).toBe('campaign-tick');
    expect(opts.delay).toBe(0);
    expect(await h.fakeRedis.current.get('campaign:token:camp-3')).toBe(data.token);
  });

  it('sem número conectado: erro claro', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValueOnce({ id: 'c', status: 'DRAFT', whatsappSessionId: null });
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue(null);
    await expect(startCampaign('c', tenantId)).rejects.toThrow(/Nenhum WhatsApp conectado/);
  });

  it('cancelar campanha em envio invalida a corrente de envios', async () => {
    await h.fakeRedis.current.set('campaign:token:camp-4', 'tok');
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: 'camp-4', status: 'RUNNING' });
    await cancelCampaign('camp-4', tenantId);
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith({ where: { id: 'camp-4' }, data: { status: 'CANCELLED' } });
    expect(await h.fakeRedis.current.get('campaign:token:camp-4')).toBeNull();
  });

  it('pausar só campanha em envio', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: 'camp-5', status: 'DRAFT' });
    await expect(pauseCampaign('camp-5', tenantId)).rejects.toThrow(ValidationError);
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: 'camp-5', status: 'RUNNING' });
    await pauseCampaign('camp-5', tenantId);
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith({ where: { id: 'camp-5' }, data: { status: 'PAUSED' } });
  });

  it('conclui só quando não há pendentes e não sobrescreve CANCELLED', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'CANCELLED' });
    expect(await checkCampaignCompletion('x')).toBe(false);
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'RUNNING' });
    mockPrisma.campaignContact.count.mockResolvedValue(2);
    expect(await checkCampaignCompletion('x')).toBe(false);
    mockPrisma.campaignContact.count.mockResolvedValue(0);
    expect(await checkCampaignCompletion('x')).toBe(true);
  });
});

describe('campaign.service — kill-switch de qualidade (janela de 20 envios)', () => {
  const sent = (n: number) => Array.from({ length: n }, () => 'sent' as const);

  it('regra: > 5% de erro (2 em 20) ou > 2% de opt-out (1 em 20) pausa', () => {
    expect(shouldKillCampaign([...sent(19), 'error']).kill).toBe(false);
    expect(shouldKillCampaign([...sent(18), 'error', 'error']).kill).toBe(true);
    expect(shouldKillCampaign([...sent(19), 'optout']).kill).toBe(true);
    // erros antigos fora da janela de 20 não contam
    expect(shouldKillCampaign(['error', ...sent(20), 'error']).kill).toBe(false);
  });

  it('2 erros seguidos numa campanha em envio: PAUSED, corrente invalidada e aviso ao painel', async () => {
    await h.fakeRedis.current.set('campaign:token:cpk', 'tok');
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'RUNNING', tenantId, name: 'Black Friday' });
    expect(await recordCampaignOutcome('cpk', 'sent')).toBe(false);
    expect(await recordCampaignOutcome('cpk', 'error')).toBe(false);
    expect(await recordCampaignOutcome('cpk', 'error')).toBe(true);
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith({ where: { id: 'cpk' }, data: { status: 'PAUSED' } });
    expect(await h.fakeRedis.current.get('campaign:token:cpk')).toBeNull();
    expect(emitted.find((e) => e.event === 'campaign:paused')?.payload.message).toMatch(/pausada por segurança/);
  });

  it('1 pedido para sair também pausa', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'RUNNING', tenantId, name: 'X' });
    expect(await recordCampaignOutcome('cpo', 'optout')).toBe(true);
  });
});
