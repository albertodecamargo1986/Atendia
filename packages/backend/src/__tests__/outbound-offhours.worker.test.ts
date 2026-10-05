/**
 * Worker de saída (sem envio duplicado, sem repetir envio incerto, bloqueio por restrição)
 * e worker de "fora do horário" (aviso gravado/enfileirado, sem mudar status).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mocks } = vi.hoisted(() => ({
  mockPrisma: {
    message: { findUnique: vi.fn(), update: vi.fn() },
    conversation: { findFirst: vi.fn(), update: vi.fn() },
  },
  mocks: {
    sendHumanized: vi.fn(),
    reserveAutomaticSend: vi.fn(),
    emitWebhookEvent: vi.fn(),
    queueAutomatedMessage: vi.fn(),
    resolveConversationRoute: vi.fn(),
    emit: vi.fn(),
  },
}));

vi.mock('bullmq', () => {
  class DelayedError extends Error {}
  return { Worker: vi.fn(() => ({ on: vi.fn() })), Queue: vi.fn(), DelayedError };
});
vi.mock('../lib/redis.js', () => ({ default: {} }));
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/socket.js', () => ({ getIO: () => ({ to: () => ({ emit: mocks.emit }) }) }));
vi.mock('../services/webhook.service.js', () => ({ emitWebhookEvent: mocks.emitWebhookEvent }));
vi.mock('../services/whatsapp.service.js', () => {
  class MaybeSentError extends Error { readonly maybeSent = true; }
  class SessionRestrictedError extends Error {
    readonly restricted = true;
    constructor(readonly until: Date) { super('restrito'); }
  }
  return {
    sendHumanized: mocks.sendHumanized,
    reserveAutomaticSend: mocks.reserveAutomaticSend,
    queueAutomatedMessage: mocks.queueAutomatedMessage,
    resolveConversationRoute: mocks.resolveConversationRoute,
    MaybeSentError,
    SessionRestrictedError,
  };
});

import { processOutboundJob } from '../workers/whatsapp-outbound.worker.js';
import { processOffHoursJob, offHoursText } from '../workers/offhours-message.worker.js';
import { MaybeSentError, SessionRestrictedError } from '../services/whatsapp.service.js';
import { DelayedError } from 'bullmq';

const data = {
  sessionId: 'sess1', tenantId: 't1', conversationId: 'cv1', jid: '5511@s.whatsapp.net',
  content: 'Olá', messageId: 'msg-1',
};
const job = (over: any = {}) => ({ data: { ...data, ...over }, attemptsMade: 0, opts: { attempts: 2 } });
const savedMetadata = () => mockPrisma.message.update.mock.calls.at(-1)?.[0].data.metadata;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.message.findUnique.mockResolvedValue({ metadata: { userId: 'u1' } });
  mockPrisma.message.update.mockResolvedValue({});
  mocks.reserveAutomaticSend.mockResolvedValue(0);
});

describe('worker de saída', () => {
  it('envia pelo serializador com idempotência pelo messageId e grava waMessageId/status', async () => {
    mocks.sendHumanized.mockResolvedValue({ skipped: false, id: 'WA123' });
    const res = await processOutboundJob(job({ automatic: true }) as any);
    expect(mocks.sendHumanized).toHaveBeenCalledWith('sess1', data.jid, { kind: 'text', text: 'Olá' }, { idempotencyKey: 'msg-1', automatic: true });
    expect(res).toMatchObject({ success: true, sentId: 'WA123' });
    expect(savedMetadata()).toMatchObject({ userId: 'u1', waMessageId: 'WA123', status: 'sent' });
    expect(mocks.emitWebhookEvent).toHaveBeenCalledWith('t1', 'message.sent', expect.objectContaining({ waMessageId: 'WA123' }));
  });

  it('erro DEPOIS de chamar o WhatsApp: não repete (não relança) e marca status incerto', async () => {
    mocks.sendHumanized.mockRejectedValue(new MaybeSentError('timeout'));
    const res = await processOutboundJob(job() as any);
    expect(res).toMatchObject({ success: false, maybeSent: true });
    expect(savedMetadata()).toMatchObject({ status: 'unknown' });
  });

  it('erro ANTES de enviar (sessão caiu): relança para a 2ª tentativa', async () => {
    mocks.sendHumanized.mockRejectedValue(new Error('Sessão WhatsApp não encontrada'));
    await expect(processOutboundJob(job() as any)).rejects.toThrow('Sessão');
    expect(mockPrisma.message.update).not.toHaveBeenCalled(); // ainda não é a última tentativa
  });

  it('número limitado (463): mensagem automática bloqueada sem nova tentativa', async () => {
    mocks.sendHumanized.mockRejectedValue(new SessionRestrictedError(new Date()));
    const res = await processOutboundJob(job({ automatic: true }) as any);
    expect(res).toMatchObject({ restricted: true });
    expect(savedMetadata()).toMatchObject({ status: 'blocked' });
  });

  it('já enviado antes (idempotência): não envia de novo', async () => {
    mocks.sendHumanized.mockResolvedValue({ skipped: true });
    expect(await processOutboundJob(job() as any)).toMatchObject({ skipped: true });
    expect(mocks.emitWebhookEvent).not.toHaveBeenCalled();
  });

  it('teto de automáticas: sem vaga, o job volta para a fila com atraso (não é descartado nem enviado)', async () => {
    mocks.reserveAutomaticSend.mockResolvedValue(42_000);
    const moveToDelayed = vi.fn(async (_ts: number, _token?: string) => {});
    const before = Date.now();
    await expect(processOutboundJob({ ...job({ automatic: true }), moveToDelayed } as any, 'tok')).rejects.toBeInstanceOf(DelayedError);
    expect(moveToDelayed.mock.calls[0][0]).toBeGreaterThanOrEqual(before + 42_000);
    expect(moveToDelayed.mock.calls[0][1]).toBe('tok');
    expect(mocks.sendHumanized).not.toHaveBeenCalled();
  });

  it('mensagem do operador (não automática) não passa pelo teto', async () => {
    mocks.sendHumanized.mockResolvedValue({ skipped: false, id: 'W' });
    await processOutboundJob(job() as any);
    expect(mocks.reserveAutomaticSend).not.toHaveBeenCalled();
  });

  it('arquivo do operador vai como mídia (caminho dentro de uploads)', async () => {
    mocks.sendHumanized.mockResolvedValue({ skipped: false, id: 'W2' });
    await processOutboundJob(job({ content: 'contrato.pdf', media: { mediaType: 'DOCUMENT', url: '/uploads/t1/abc.pdf', fileName: 'contrato.pdf' } }) as any);
    const payload = mocks.sendHumanized.mock.calls[0][2];
    expect(payload).toMatchObject({ kind: 'media', mediaType: 'DOCUMENT', fileName: 'contrato.pdf' });
    expect(payload.path).toContain('abc.pdf');
  });
});

describe('worker de fora do horário', () => {
  it('grava e enfileira o aviso pela rota da conversa e NÃO muda o status', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'cv1', channel: 'WHATSAPP', status: 'ACTIVE' });
    mocks.resolveConversationRoute.mockResolvedValue({ sessionId: 'sess1', jid: '5511@s.whatsapp.net' });
    mocks.queueAutomatedMessage.mockResolvedValue({ id: 'm-off' });
    await processOffHoursJob({ data: { tenantId: 't1', conversationId: 'cv1', agentName: 'Bia' } } as any);
    expect(mocks.queueAutomatedMessage).toHaveBeenCalledWith({
      tenantId: 't1', conversationId: 'cv1', sessionId: 'sess1', jid: '5511@s.whatsapp.net',
      content: offHoursText('Bia'), kind: 'offhours',
    });
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });
});
