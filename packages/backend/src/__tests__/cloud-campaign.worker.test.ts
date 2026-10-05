/**
 * Campanha pelo número oficial (Cloud API): só modelo aprovado, mantendo janela seg–sex 9–19h,
 * restrição, opt-out, elegibilidade por número, kill-switch e cota (tier da Meta). Ritmo curto
 * (sem pausas de 10–20 min). O número de QR Code continua no caminho antigo (sendCampaignText).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeRedis } from './helpers/fake-redis.js';

const { h, mockPrisma, mocks } = vi.hoisted(() => ({
  h: { fakeRedis: { current: null as any } },
  mockPrisma: {
    campaign: { findFirst: vi.fn(), update: vi.fn() },
    whatsAppSession: { findUnique: vi.fn() },
    campaignContact: { count: vi.fn(), findFirst: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn() },
    agent: { findFirst: vi.fn() },
    message: { create: vi.fn() },
  },
  mocks: {
    getActiveSocket: vi.fn(),
    sendCampaignText: vi.fn(),
    sendCloudCampaignTemplate: vi.fn(),
    markRecipientSent: vi.fn(),
    markRecipientFailed: vi.fn(),
    checkCampaignCompletion: vi.fn(),
    queueAdd: vi.fn(),
    isRecipientStillEligible: vi.fn(),
    recordCampaignOutcome: vi.fn(),
  },
}));

vi.mock('bullmq', () => ({ Worker: vi.fn(() => ({ on: vi.fn() })), Queue: vi.fn() }));
vi.mock('../lib/redis.js', () => ({
  default: new Proxy({}, { get: (_t, prop) => (h.fakeRedis.current as any)[prop] }),
}));
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../services/whatsapp.service.js', () => ({
  getActiveSocket: mocks.getActiveSocket,
  sendCampaignText: mocks.sendCampaignText,
  sendCloudCampaignTemplate: mocks.sendCloudCampaignTemplate,
}));
vi.mock('../services/campaign.service.js', () => ({
  markRecipientSent: mocks.markRecipientSent,
  markRecipientFailed: mocks.markRecipientFailed,
  checkCampaignCompletion: mocks.checkCampaignCompletion,
  startCampaign: vi.fn(),
  enqueueCampaignChain: vi.fn(),
  campaignTokenKey: (id: string) => `campaign:token:${id}`,
  isRecipientStillEligible: mocks.isRecipientStillEligible,
  recordCampaignOutcome: mocks.recordCampaignOutcome,
}));
vi.mock('../workers/queues.js', () => ({ campaignQueue: { add: mocks.queueAdd } }));

import { processCampaignTick } from '../workers/campaign.worker.js';
import { markSessionRestricted, _resetRestrictionCache } from '../lib/wa-guards.js';
import { CloudApiError } from '../lib/wa-cloud-api.js';

const sp = (isoLocal: string) => new Date(`${isoLocal}-03:00`);
const MONDAY_10H = sp('2026-10-05T10:00:00');
const SATURDAY = sp('2026-10-10T10:00:00');
const cloudSession: any = {
  id: 'db1', sessionId: 'wacloud1', status: 'CONNECTED', agentId: null, provider: 'CLOUD_API',
  createdAt: new Date('2026-10-01T00:00:00Z'), linkedAt: new Date(), campaignsDisabledAt: null,
  cloudConfig: { messagingLimitTier: 'TIER_250' },
};
const contact = { id: 'ct1', name: 'maria silva', phone: '5511988887777', optedOutAt: null as Date | null };
const tick = { campaignId: 'cp1', tenantId: 't1', token: 'tok1' };
let waits: number[];
const deps = (now: Date) => {
  waits = [];
  return { now: () => now, random: () => 0.5, wait: async (ms: number) => { waits.push(ms); } };
};
let campaign: any;

beforeEach(async () => {
  vi.clearAllMocks();
  h.fakeRedis.current = createFakeRedis();
  _resetRestrictionCache();
  await h.fakeRedis.current.set('campaign:token:cp1', 'tok1');
  contact.optedOutAt = null;
  campaign = {
    id: 'cp1', status: 'RUNNING', message: 'Olá {{1}}, temos novidades!', templateName: 'promo', templateLanguage: 'pt_BR',
    templateParams: [{ name: '1', value: '{nome}' }], whatsappSession: cloudSession,
  };
  mockPrisma.whatsAppSession.findUnique.mockResolvedValue({ restrictedUntil: null });
  mockPrisma.campaign.findFirst.mockImplementation(async (args: any) => (args.include ? campaign : { status: 'RUNNING' }));
  mockPrisma.campaignContact.count.mockResolvedValue(0);
  mockPrisma.campaignContact.findFirst.mockResolvedValue({ id: 'r1', contact });
  mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'cv1' });
  mocks.isRecipientStillEligible.mockResolvedValue(true);
  mocks.recordCampaignOutcome.mockResolvedValue(false);
  mocks.checkCampaignCompletion.mockResolvedValue(false);
  mocks.sendCloudCampaignTemplate.mockResolvedValue({ exists: true, skipped: false, id: 'wamid.C1', jid: '5511988887777@s.whatsapp.net' });
});

describe('campanha pelo número oficial', () => {
  it('envia o MODELO com {nome} preenchido, grava o texto na conversa e o próximo envio vem logo (sem pausa longa)', async () => {
    const res = await processCampaignTick(tick, deps(MONDAY_10H));
    expect(res).toMatchObject({ sent: true, nextDelay: 0 });
    expect(mocks.sendCloudCampaignTemplate).toHaveBeenCalledWith(
      'wacloud1', '5511988887777',
      { name: 'promo', language: 'pt_BR', bodyParams: ['Maria'], paramNames: null },
      'campaign-r1',
    );
    expect(mocks.sendCampaignText).not.toHaveBeenCalled();
    // P2-5: elegibilidade estrita ao número oficial
    expect(mocks.isRecipientStillEligible).toHaveBeenCalledWith('t1', contact, 'db1', { strictSession: true });
    expect(waits[0]).toBeGreaterThanOrEqual(2_000);
    expect(waits[0]).toBeLessThanOrEqual(4_000);
    expect(mockPrisma.message.create.mock.calls[0][0].data.content).toBe('Olá Maria, temos novidades!');
    expect(await h.fakeRedis.current.get('wa:campmsg:wacloud1:wamid.C1')).toBe('cp1');
    expect(mocks.recordCampaignOutcome).toHaveBeenCalledWith('cp1', 'sent');
  });

  it('janela seg–sex 9–19h continua valendo', async () => {
    const res = await processCampaignTick(tick, deps(SATURDAY));
    expect(res).toMatchObject({ rescheduled: 'window' });
    expect(mocks.sendCloudCampaignTemplate).not.toHaveBeenCalled();
  });

  it('opt-out e elegibilidade por número continuam valendo', async () => {
    contact.optedOutAt = new Date();
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toMatchObject({ skipped: 'opted_out' });
    contact.optedOutAt = null;
    mocks.isRecipientStillEligible.mockResolvedValue(false);
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toMatchObject({ skipped: 'not_eligible' });
    expect(mocks.sendCloudCampaignTemplate).not.toHaveBeenCalled();
  });

  it('número restrito (ex.: 131048 da Meta): espera o fim da pausa', async () => {
    await markSessionRestricted('wacloud1', new Date(MONDAY_10H.getTime() + 3600_000));
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toMatchObject({ rescheduled: 'restricted' });
    expect(mocks.sendCloudCampaignTemplate).not.toHaveBeenCalled();
  });

  it('cota pelo tier da Meta (TIER_250)', async () => {
    mockPrisma.campaignContact.count.mockResolvedValue(250);
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toMatchObject({ rescheduled: 'quota', quota: 250 });
  });

  it('campanha sem modelo no número oficial: pausa (nunca manda texto livre)', async () => {
    campaign.templateName = null;
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toEqual({ stopped: 'no_template' });
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith({ where: { id: 'cp1' }, data: { status: 'PAUSED' } });
    expect(mocks.sendCampaignText).not.toHaveBeenCalled();
  });

  it('Meta recusa o envio: destinatário falha com motivo em português e conta no kill-switch', async () => {
    mocks.sendCloudCampaignTemplate.mockRejectedValue(new CloudApiError(131026, 400, 'undeliverable'));
    mocks.recordCampaignOutcome.mockResolvedValue(true);
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toEqual({ stopped: 'kill_switch' });
    expect(mocks.markRecipientFailed).toHaveBeenCalledWith('r1', expect.stringMatching(/não entregue/));
    expect(mocks.recordCampaignOutcome).toHaveBeenCalledWith('cp1', 'error');
  });

  it('número oficial desconectado: tenta mais tarde (sem envio)', async () => {
    campaign.whatsappSession = { ...cloudSession, status: 'DISCONNECTED' };
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toMatchObject({ rescheduled: 'session_offline' });
  });
});

describe('regressão — campanha pelo QR Code segue o caminho antigo', () => {
  it('sessão sem provider (BAILEYS): sendCampaignText, espera 25–60 s, nunca o envio por modelo', async () => {
    campaign.whatsappSession = { ...cloudSession, provider: 'BAILEYS', sessionId: 'qr1', cloudConfig: null, linkedAt: new Date('2025-01-01') };
    campaign.message = '{Olá|Oi} {nome}!';
    mocks.getActiveSocket.mockReturnValue({});
    mocks.sendCampaignText.mockResolvedValue({ exists: true, skipped: false, id: 'WA1', jid: '5511988887777@s.whatsapp.net' });
    await processCampaignTick(tick, deps(MONDAY_10H));
    expect(mocks.sendCampaignText).toHaveBeenCalledWith('qr1', '5511988887777', expect.stringMatching(/Maria!$/), 'campaign-r1');
    expect(mocks.sendCloudCampaignTemplate).not.toHaveBeenCalled();
    expect(waits[0]).toBeGreaterThanOrEqual(25_000);
  });
});
