/**
 * Campanha — política conservadora no worker: janela seg–sex 9–19h, número conectado,
 * restrição 463, cota diária com aquecimento, espera 25–60 s ANTES de cada envio,
 * opt-out, onWhatsApp, pausa longa a cada 25 e corrente única por campanha (token).
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

import { processCampaignTick, campaignRecipientJid } from '../workers/campaign.worker.js';
import { markSessionRestricted, _resetRestrictionCache } from '../lib/wa-guards.js';

const sp = (isoLocal: string) => new Date(`${isoLocal}-03:00`);
const MONDAY_10H = sp('2026-10-05T10:00:00');
const session: any = {
  id: 'db1', sessionId: 'sess1', status: 'CONNECTED', agentId: null,
  createdAt: new Date('2025-01-01T00:00:00Z'), linkedAt: new Date('2025-01-01T00:00:00Z'), campaignsDisabledAt: null,
};
const contact = { id: 'ct1', name: 'Maria Silva', phone: '5511988887777', optedOutAt: null as Date | null };

let waits: number[];
function deps(now: Date) {
  waits = [];
  return { now: () => now, random: () => 0.5, wait: async (ms: number) => { waits.push(ms); } };
}
const tick = { campaignId: 'cp1', tenantId: 't1', token: 'tok1' };
const nextDelay = () => mocks.queueAdd.mock.calls.at(-1)?.[2].delay;

beforeEach(async () => {
  vi.clearAllMocks();
  h.fakeRedis.current = createFakeRedis();
  _resetRestrictionCache();
  await h.fakeRedis.current.set('campaign:token:cp1', 'tok1');
  mocks.isRecipientStillEligible.mockResolvedValue(true);
  mocks.recordCampaignOutcome.mockResolvedValue(false);
  session.linkedAt = new Date('2025-01-01T00:00:00Z');
  session.campaignsDisabledAt = null;
  mockPrisma.whatsAppSession.findUnique.mockResolvedValue({ restrictedUntil: null });
  mockPrisma.campaign.findFirst.mockImplementation(async (args: any) =>
    args.include
      ? { id: 'cp1', status: 'RUNNING', message: '{Olá|Oi} {nome}!', whatsappSession: session }
      : { status: 'RUNNING' });
  mockPrisma.campaignContact.count.mockResolvedValue(0);
  mockPrisma.campaignContact.findFirst.mockResolvedValue({ id: 'r1', contact });
  mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'cv1' });
  mocks.getActiveSocket.mockReturnValue({});
  mocks.sendCampaignText.mockResolvedValue({ exists: true, skipped: false, id: 'WA1', jid: '5511988887777@s.whatsapp.net' });
  mocks.checkCampaignCompletion.mockResolvedValue(false);
  contact.optedOutAt = null;
});

describe('campanha — ritmo e regras', () => {
  it('espera 25–60 s ANTES do envio, personaliza ({nome} + spintax) e agenda o próximo a partir do fim', async () => {
    const res = await processCampaignTick(tick, deps(MONDAY_10H));
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(25_000);
    expect(waits[0]).toBeLessThanOrEqual(60_000);
    expect(mocks.sendCampaignText).toHaveBeenCalledWith('sess1', contact.phone, 'Oi Maria!', 'campaign-r1');
    expect(mocks.markRecipientSent).toHaveBeenCalledWith('r1');
    expect(res).toMatchObject({ sent: true, nextDelay: 0 });
    // grava a mensagem na conversa do contato (contexto para a IA)
    expect(mockPrisma.message.create).toHaveBeenCalledWith({ data: expect.objectContaining({ conversationId: 'cv1', role: 'ASSISTANT', content: 'Oi Maria!' }) });
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
  });

  it('fora da janela (sábado): não envia e reagenda para segunda 9h', async () => {
    const saturday = sp('2026-10-03T10:00:00');
    const res = await processCampaignTick(tick, deps(saturday));
    expect(mocks.sendCampaignText).not.toHaveBeenCalled();
    expect(res).toMatchObject({ rescheduled: 'window' });
    const target = sp('2026-10-05T09:00:00').getTime() - saturday.getTime();
    expect(nextDelay()).toBeGreaterThanOrEqual(target);
    expect(nextDelay()).toBeLessThanOrEqual(target + 15 * 60_000);
  });

  it('19h ou mais em dia útil: espera o próximo dia útil', async () => {
    const res = await processCampaignTick(tick, deps(sp('2026-10-05T19:05:00')));
    expect(res).toMatchObject({ rescheduled: 'window' });
    expect(mocks.sendCampaignText).not.toHaveBeenCalled();
  });

  it('cota diária atingida: reagenda para o próximo dia útil 9h', async () => {
    mockPrisma.campaignContact.count.mockResolvedValue(200);
    const res = await processCampaignTick(tick, deps(MONDAY_10H));
    expect(res).toMatchObject({ rescheduled: 'quota', quota: 200 });
    expect((res as any).at.toISOString()).toBe(sp('2026-10-06T09:00:00').toISOString());
    expect(mocks.sendCampaignText).not.toHaveBeenCalled();
  });

  it('aquecimento: número antigo (criado há 1 ano) PAREADO de novo há 2 dias tem cota de 28 (não 200)', async () => {
    session.linkedAt = new Date(MONDAY_10H.getTime() - 2 * 86_400_000);
    mockPrisma.campaignContact.count.mockResolvedValue(28);
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toMatchObject({ rescheduled: 'quota', quota: 28 });
  });

  it('número pareado há mais de 14 dias: cota cheia de 200', async () => {
    mockPrisma.campaignContact.count.mockResolvedValue(28);
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toMatchObject({ sent: true });
  });

  it('contato que não conversou com ESTE número nos últimos 90 dias é pulado no envio (revalidação)', async () => {
    mocks.isRecipientStillEligible.mockResolvedValue(false);
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toMatchObject({ skipped: 'not_eligible' });
    expect(mocks.isRecipientStillEligible).toHaveBeenCalledWith('t1', contact, 'db1');
    expect(mocks.sendCampaignText).not.toHaveBeenCalled();
  });

  it('campanhas desligadas no número (2ª restrição em 30 dias): a campanha para', async () => {
    session.campaignsDisabledAt = new Date();
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toEqual({ stopped: 'campaigns_disabled' });
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith({ where: { id: 'cp1' }, data: { status: 'PAUSED' } });
  });

  it('kill-switch: envio conta no histórico e o id da mensagem fica ligado à campanha (para acks de erro)', async () => {
    await processCampaignTick(tick, deps(MONDAY_10H));
    expect(mocks.recordCampaignOutcome).toHaveBeenCalledWith('cp1', 'sent');
    expect(await h.fakeRedis.current.get('wa:campmsg:sess1:WA1')).toBe('cp1');
  });

  it('kill-switch disparado por número inexistente: a corrente para', async () => {
    mocks.sendCampaignText.mockResolvedValue({ exists: false });
    mocks.recordCampaignOutcome.mockResolvedValue(true);
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toEqual({ stopped: 'kill_switch' });
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it('número desconectado: tenta de novo em 10 min, sem envio', async () => {
    mocks.getActiveSocket.mockReturnValue(undefined);
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toMatchObject({ rescheduled: 'session_offline' });
    expect(nextDelay()).toBe(10 * 60_000);
  });

  it('número limitado (463): espera a pausa de 24 h acabar', async () => {
    await markSessionRestricted('sess1', new Date(Date.now() + 24 * 3600_000));
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toMatchObject({ rescheduled: 'restricted' });
    expect(mocks.sendCampaignText).not.toHaveBeenCalled();
  });

  it('contato que pediu para sair é pulado', async () => {
    contact.optedOutAt = new Date();
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toMatchObject({ skipped: 'opted_out' });
    expect(mocks.markRecipientFailed).toHaveBeenCalledWith('r1', expect.stringContaining('não receber'));
    expect(mocks.sendCampaignText).not.toHaveBeenCalled();
  });

  it('número sem WhatsApp (onWhatsApp) é pulado', async () => {
    mocks.sendCampaignText.mockResolvedValue({ exists: false });
    expect(await processCampaignTick(tick, deps(MONDAY_10H))).toMatchObject({ skipped: 'not_on_whatsapp' });
    expect(mocks.markRecipientFailed).toHaveBeenCalledWith('r1', 'Número sem WhatsApp');
  });

  it('pausa longa de 10–20 min a cada 25 envios', async () => {
    for (let i = 1; i <= 24; i++) {
      const r = await processCampaignTick(tick, deps(MONDAY_10H));
      expect((r as any).nextDelay).toBe(0);
    }
    const r25 = await processCampaignTick(tick, deps(MONDAY_10H));
    expect((r25 as any).nextDelay).toBeGreaterThanOrEqual(10 * 60_000);
    expect((r25 as any).nextDelay).toBeLessThanOrEqual(20 * 60_000);
  });

  it('cancelada/pausada durante a espera: não envia', async () => {
    const d = deps(MONDAY_10H);
    d.wait = async () => { await h.fakeRedis.current.del('campaign:token:cp1'); };
    expect(await processCampaignTick(tick, d)).toEqual({ stopped: 'stale_token' });
    expect(mocks.sendCampaignText).not.toHaveBeenCalled();
  });

  it('token antigo (outra corrente, ex.: antes de reiniciar o servidor): não envia', async () => {
    expect(await processCampaignTick({ ...tick, token: 'velho' }, deps(MONDAY_10H))).toEqual({ stopped: 'stale_token' });
    expect(mockPrisma.campaign.findFirst).not.toHaveBeenCalled();
  });

  it('envio incerto (erro depois de chamar o WhatsApp): marca falha e NÃO reenvia', async () => {
    mocks.sendCampaignText.mockRejectedValue(Object.assign(new Error('timeout'), { maybeSent: true }));
    await processCampaignTick(tick, deps(MONDAY_10H));
    expect(mocks.markRecipientFailed).toHaveBeenCalledWith('r1', expect.stringContaining('incerto'));
    expect(mocks.sendCampaignText).toHaveBeenCalledTimes(1);
  });

  it('JID de campanha usa @s.whatsapp.net', () => {
    expect(campaignRecipientJid('5511988887777')).toBe('5511988887777@s.whatsapp.net');
  });
});
