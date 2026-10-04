import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeRedis } from './helpers/fake-redis.js';

const { h, mockPrisma, mockQueue } = vi.hoisted(() => ({
  h: { fakeRedis: { current: null as any } },
  mockPrisma: {
    contact: { findMany: vi.fn() },
    conversation: { findMany: vi.fn() },
    whatsAppSession: { findFirst: vi.fn(), findUnique: vi.fn() },
    campaign: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    campaignContact: { count: vi.fn() },
  },
  mockQueue: { add: vi.fn() },
}));

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/redis.js', () => ({
  default: new Proxy({}, { get: (_t, prop) => (h.fakeRedis.current as any)[prop] }),
}));
vi.mock('../workers/queues.js', () => ({ campaignQueue: mockQueue }));

import {
  createCampaign, startCampaign, cancelCampaign, pauseCampaign, getEligibleContacts, checkCampaignCompletion,
} from '../services/campaign.service.js';
import { ValidationError, ConflictError } from '../lib/errors.js';

const tenantId = 'tenant-1';

beforeEach(() => {
  vi.clearAllMocks();
  h.fakeRedis.current = createFakeRedis();
  mockPrisma.campaign.update.mockResolvedValue({});
});

describe('campaign.service — quem pode receber (política conservadora)', () => {
  it('só contatos com mensagem recebida nos últimos 90 dias e sem opt-out', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([{ contactId: 'c1', contactPhone: '551' }, { contactId: null, contactPhone: '552' }]);
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: 'c1', name: 'A', phone: '551' },
      { id: 'c2', name: 'B', phone: '552' }, // casa pelo telefone
      { id: 'c3', name: 'C', phone: '553' }, // nunca escreveu: fora
    ]);
    const eligible = await getEligibleContacts(tenantId);
    expect(eligible.map((c) => c.id)).toEqual(['c1', 'c2']);

    const convWhere = mockPrisma.conversation.findMany.mock.calls[0][0].where;
    expect(convWhere.messages.some.role).toBe('USER');
    const since: Date = convWhere.messages.some.createdAt.gte;
    expect(Date.now() - since.getTime()).toBeGreaterThan(89 * 86_400_000);
    expect(Date.now() - since.getTime()).toBeLessThan(91 * 86_400_000);
    expect(mockPrisma.contact.findMany.mock.calls[0][0].where).toMatchObject({ tenantId, optedOutAt: null, isGroup: false });
  });
});

describe('campaign.service — createCampaign', () => {
  it('rejeita contactIds de outro tenant (IDOR)', async () => {
    mockPrisma.contact.findMany.mockResolvedValueOnce([{ id: 'c-meu' }]);
    await expect(createCampaign(tenantId, 'Promo', 'Oi!', ['c-meu', 'c-de-outro-tenant'])).rejects.toThrow(ValidationError);
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('cria só com os elegíveis e informa quantos ficaram de fora', async () => {
    mockPrisma.contact.findMany
      .mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }]) // IDOR
      .mockResolvedValueOnce([{ id: 'c1', name: 'A', phone: '551' }, { id: 'c2', name: 'B', phone: '552' }]);
    mockPrisma.conversation.findMany.mockResolvedValue([{ contactId: 'c1', contactPhone: '551' }]);
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'wa1' });
    mockPrisma.campaign.create.mockImplementation(async ({ data }: any) => ({ id: 'camp-1', ...data }));

    const result = await createCampaign(tenantId, 'Promo', 'Oi {nome}', ['c1', 'c2', 'c1'], undefined, 'wa1');
    expect(mockPrisma.campaign.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalRecipients: 1, whatsappSessionId: 'wa1', recipients: { create: [{ contactId: 'c1' }] } }),
    }));
    expect(result.excludedCount).toBe(1);
  });

  it('nenhum elegível: erro explicando a regra', async () => {
    mockPrisma.contact.findMany.mockResolvedValueOnce([{ id: 'c1' }]).mockResolvedValueOnce([{ id: 'c1', name: 'A', phone: '551' }]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    await expect(createCampaign(tenantId, 'Promo', 'Oi', ['c1'])).rejects.toThrow(/90 dias/);
  });

  it('número de outro tenant é recusado', async () => {
    mockPrisma.contact.findMany.mockResolvedValueOnce([{ id: 'c1' }]);
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue(null);
    await expect(createCampaign(tenantId, 'Promo', 'Oi', ['c1'], undefined, 'wa-de-outro')).rejects.toThrow();
  });
});

describe('campaign.service — iniciar, pausar, cancelar', () => {
  it('não inicia campanha CANCELLED', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: 'camp-1', status: 'CANCELLED' });
    await expect(startCampaign('camp-1', tenantId)).rejects.toThrow(ConflictError);
    expect(mockPrisma.campaign.update).not.toHaveBeenCalled();
  });

  it('uma campanha em envio por número (trava)', async () => {
    mockPrisma.campaign.findFirst
      .mockResolvedValueOnce({ id: 'camp-2', status: 'DRAFT', whatsappSessionId: 'wa1' })
      .mockResolvedValueOnce({ name: 'Outra' });
    await expect(startCampaign('camp-2', tenantId)).rejects.toThrow(/Já existe uma campanha em envio/);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('inicia com o 1º número conectado e UM tick (nada de atrasos pré-calculados)', async () => {
    mockPrisma.campaign.findFirst
      .mockResolvedValueOnce({ id: 'camp-3', status: 'DRAFT', whatsappSessionId: null, startedAt: null })
      .mockResolvedValueOnce(null);
    mockPrisma.whatsAppSession.findFirst.mockResolvedValue({ id: 'wa9' });
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

  it('pausar só campanha em envio; retomar gera corrente nova', async () => {
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
