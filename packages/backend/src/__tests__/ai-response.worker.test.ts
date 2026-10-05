/**
 * Worker da IA: debounce (3 mensagens rápidas = 1 resposta), idempotência, rechecagem de
 * status/horário, anti-loop robô↔robô, restrição do número e contexto vindo do banco.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeRedis } from './helpers/fake-redis.js';

const { h, mockPrisma, mocks } = vi.hoisted(() => ({
  h: { fakeRedis: { current: null as any }, emitted: [] as any[] },
  mockPrisma: {
    conversation: { findFirst: vi.fn(), update: vi.fn() },
    whatsAppSession: { findUnique: vi.fn() },
    message: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
  },
  mocks: {
    generateResponse: vi.fn(),
    resolveConversationRoute: vi.fn(),
    isWithinBusinessHours: vi.fn(),
    outboundAdd: vi.fn(),
    aiQueueAdd: vi.fn(),
    aiQueueGetJob: vi.fn(),
    generateAudioResponse: vi.fn(),
  },
}));

vi.mock('bullmq', () => ({ Worker: vi.fn(() => ({ on: vi.fn() })), Queue: vi.fn() }));
vi.mock('../lib/redis.js', () => ({
  default: new Proxy({}, { get: (_t, prop) => (h.fakeRedis.current as any)[prop] }),
}));
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/socket.js', () => ({
  getIO: () => ({ to: (room: string) => ({ emit: (event: string, payload: any) => h.emitted.push({ room, event, payload }) }) }),
}));
vi.mock('../services/ai.service.js', () => ({ generateResponse: mocks.generateResponse }));
vi.mock('../services/whatsapp.service.js', () => ({ resolveConversationRoute: mocks.resolveConversationRoute }));
vi.mock('../services/business-hours.service.js', () => ({ isWithinBusinessHours: mocks.isWithinBusinessHours }));
vi.mock('../services/voice.service.js', () => ({ generateAudioResponse: mocks.generateAudioResponse, MAX_TTS_CHARS: 600 }));
vi.mock('../workers/queues.js', () => ({
  whatsappOutboundQueue: { add: mocks.outboundAdd },
  aiResponseQueue: { add: mocks.aiQueueAdd, getJob: mocks.aiQueueGetJob },
}));

import { processAiResponseJob } from '../workers/ai-response.worker.js';
import { getConversationContext, scheduleAiResponse, AI_DEBOUNCE_MS } from '../lib/ai-schedule.js';
import { markSessionRestricted, _resetRestrictionCache } from '../lib/wa-guards.js';

const TENANT = 't1';
const agent = { id: 'ag1', isActive: true, responseDelayMinMs: 0, responseDelayMaxMs: 0, sendAudioFrequency: 0, voiceProfile: null };
let latestUserId = 'm3';
let conversationStatus = 'ACTIVE';
let audioPending = false;

function setup() {
  mockPrisma.whatsAppSession.findUnique.mockResolvedValue({ restrictedUntil: null });
  mockPrisma.conversation.findFirst.mockImplementation(async (args: any) => {
    const base = { id: 'cv1', tenantId: TENANT, channel: 'WHATSAPP', status: conversationStatus, agentId: 'ag1' };
    if (args?.select) return { status: conversationStatus, agent: { isActive: true } };
    return { ...base, agent };
  });
  mockPrisma.message.findFirst.mockImplementation(async (args: any) => {
    // consulta de "áudio ainda sendo transcrito"
    if (args?.where?.metadata) return audioPending ? { id: 'audio-1' } : null;
    return { id: latestUserId };
  });
  mockPrisma.message.findMany.mockResolvedValue([
    { role: 'ASSISTANT', content: 'resp 2' },
    { role: 'USER', content: 'msg 2' },
    { role: 'USER', content: 'msg 1' },
  ]);
  mockPrisma.message.create.mockImplementation(async ({ data }: any) => ({ id: 'ai-' + Math.random(), ...data }));
  mockPrisma.conversation.update.mockImplementation(async ({ data }: any) => ({ id: 'cv1', ...data }));
  mocks.generateResponse.mockResolvedValue('Olá! Como posso ajudar?');
  mocks.resolveConversationRoute.mockResolvedValue({ sessionId: 'sess1', jid: '5511@s.whatsapp.net' });
  mocks.isWithinBusinessHours.mockResolvedValue(true);
}

const job = (triggerMessageId?: string) => ({ data: { tenantId: TENANT, conversationId: 'cv1', agentId: 'ag1', triggerMessageId } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  h.fakeRedis.current = createFakeRedis();
  _resetRestrictionCache();
  h.emitted.length = 0;
  latestUserId = 'm3';
  conversationStatus = 'ACTIVE';
  audioPending = false;
  setup();
});
afterEach(() => { vi.useRealTimers(); });

async function run(j: any) {
  const p = processAiResponseJob(j as any);
  // A rejeição (quando houver) é verificada por quem chamou; aqui só evita o "unhandled rejection"
  // enquanto o relógio falso avança — a promessa devolvida continua rejeitando normalmente
  p.catch(() => {});
  await vi.runAllTimersAsync();
  return p;
}

describe('IA — debounce e idempotência', () => {
  it('3 mensagens rápidas → 3 jobs → só o da ÚLTIMA gera resposta (1 resposta)', async () => {
    const results = [];
    for (const id of ['m1', 'm2', 'm3']) results.push(await run(job(id)));
    expect(results.slice(0, 2)).toEqual([{ skipped: 'superseded' }, { skipped: 'superseded' }]);
    expect(mocks.generateResponse).toHaveBeenCalledTimes(1);
    expect(mocks.outboundAdd).toHaveBeenCalledTimes(1);
    expect(mocks.outboundAdd).toHaveBeenCalledWith('send', expect.objectContaining({ automatic: true, sessionId: 'sess1' }), expect.objectContaining({ jobId: expect.stringMatching(/^out-/) }));
  });

  it('mesmo job rodando de novo (retry/duplicado) não responde 2x', async () => {
    await run(job('m3'));
    expect(await run(job('m3'))).toEqual({ skipped: 'already_answered' });
    expect(mocks.outboundAdd).toHaveBeenCalledTimes(1);
  });

  it('chegou mensagem nova durante a geração: descarta (o job novo responde tudo)', async () => {
    mocks.generateResponse.mockImplementation(async () => {
      latestUserId = 'm4';
      return 'resposta velha';
    });
    expect(await run(job('m3'))).toEqual({ skipped: 'superseded' });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });
});

describe('IA — rechecagens antes de enviar', () => {
  it('conversa com humano (HUMAN_TAKEOVER) não recebe resposta', async () => {
    conversationStatus = 'HUMAN_TAKEOVER';
    expect(await run(job('m3'))).toEqual({ skipped: 'status' });
    expect(mocks.generateResponse).not.toHaveBeenCalled();
  });

  it('fora do horário (só checagem de horário, sem mudar status)', async () => {
    mocks.isWithinBusinessHours.mockResolvedValue(false);
    expect(await run(job('m3'))).toEqual({ skipped: 'off_hours' });
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });

  it('humano assumiu durante a geração: não enfileira envio', async () => {
    mocks.generateResponse.mockImplementation(async () => {
      conversationStatus = 'HUMAN_TAKEOVER';
      return 'x';
    });
    expect(await run(job('m3'))).toEqual({ skipped: 'status_changed' });
    expect(mocks.outboundAdd).not.toHaveBeenCalled();
  });

  it('número limitado pelo WhatsApp (463): IA pausada', async () => {
    await markSessionRestricted('sess1', new Date(Date.now() + 3600_000));
    expect(await run(job('m3'))).toEqual({ skipped: 'restricted' });
    expect(mocks.generateResponse).not.toHaveBeenCalled();
  });
});

describe('IA — anti-loop robô↔robô', () => {
  it('após 8 respostas em 10 min: HUMAN_TAKEOVER + aviso "Pausamos a IA"', async () => {
    for (let i = 1; i <= 8; i++) {
      latestUserId = 'u' + i;
      await run(job('u' + i));
    }
    expect(mocks.outboundAdd).toHaveBeenCalledTimes(8);
    latestUserId = 'u9';
    expect(await run(job('u9'))).toEqual({ skipped: 'ai_loop_paused' });
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'cv1' }, data: { status: 'HUMAN_TAKEOVER' } });
    expect(mockPrisma.message.create).toHaveBeenLastCalledWith({
      data: { conversationId: 'cv1', role: 'SYSTEM', content: 'Pausamos a IA: possível conversa com robô' },
    });
    expect(mocks.outboundAdd).toHaveBeenCalledTimes(8);
  });
});

describe('contexto e agendamento', () => {
  it('contexto = últimas 20 mensagens sem SYSTEM, em ordem cronológica', async () => {
    const ctx = await getConversationContext('cv1');
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'cv1', role: { not: 'SYSTEM' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { role: true, content: true },
    });
    expect(ctx).toEqual([
      { role: 'user', content: 'msg 1' },
      { role: 'user', content: 'msg 2' },
      { role: 'assistant', content: 'resp 2' },
    ]);
  });

  it('o worker usa o contexto do banco (ignora mensagens antigas no job)', async () => {
    await run({ data: { ...job('m3').data, messages: [{ role: 'user', content: 'velho' }] } });
    expect(mocks.generateResponse).toHaveBeenCalledWith('ag1', TENANT, [
      { role: 'user', content: 'msg 1' },
      { role: 'user', content: 'msg 2' },
      { role: 'assistant', content: 'resp 2' },
    ]);
  });

  it('scheduleAiResponse: atraso de ~6 s e substitui o job anterior ainda pendente', async () => {
    const prev = { getState: vi.fn(async () => 'delayed'), remove: vi.fn() };
    mocks.aiQueueGetJob.mockResolvedValue(prev);
    await scheduleAiResponse({ tenantId: TENANT, conversationId: 'cv1', triggerMessageId: 'm1' });
    await scheduleAiResponse({ tenantId: TENANT, conversationId: 'cv1', triggerMessageId: 'm2' });
    expect(AI_DEBOUNCE_MS).toBe(6000);
    expect(mocks.aiQueueAdd).toHaveBeenLastCalledWith('generate', expect.objectContaining({ triggerMessageId: 'm2' }),
      expect.objectContaining({ jobId: 'ai-cv1-m2', delay: 6000 }));
    expect(mocks.aiQueueGetJob).toHaveBeenCalledWith('ai-cv1-m1');
    expect(prev.remove).toHaveBeenCalled();
  });

  it('resposta longa (> 600 caracteres) vai em texto mesmo com voz ativada', async () => {
    agent.sendAudioFrequency = 1;
    mockPrisma.message.count.mockResolvedValue(1);
    mocks.generateResponse.mockResolvedValue('a'.repeat(700));
    await run(job('m3'));
    expect(mocks.generateAudioResponse).not.toHaveBeenCalled();
    expect(mocks.outboundAdd).toHaveBeenCalledWith('send', expect.any(Object), expect.any(Object));
    agent.sendAudioFrequency = 0;
  });

  it('voz: gera OGG/Opus para PTT', async () => {
    agent.sendAudioFrequency = 1;
    mockPrisma.message.count.mockResolvedValue(1);
    mocks.generateAudioResponse.mockResolvedValue('/x/audio/a.ogg');
    await run(job('m3'));
    expect(mocks.generateAudioResponse).toHaveBeenCalledWith(expect.any(String), 'nova', TENANT, 'openai', 'opus');
    expect(mocks.outboundAdd).toHaveBeenCalledWith('send-audio', expect.objectContaining({ audioPath: '/x/audio/a.ogg' }), expect.any(Object));
    agent.sendAudioFrequency = 0;
  });
});

describe('IA — corridas e falhas', () => {
  it('áudio do cliente ainda sendo transcrito: espera (a transcrição reagenda com a última mensagem)', async () => {
    audioPending = true;
    expect(await run(job('m3'))).toEqual({ skipped: 'waiting_transcription' });
    expect(mocks.generateResponse).not.toHaveBeenCalled();
  });

  it('falha ao enfileirar depois da trava: libera ai:answered e a nova tentativa responde', async () => {
    mocks.outboundAdd.mockRejectedValueOnce(new Error('redis caiu'));
    await expect(run(job('m3'))).rejects.toThrow('redis caiu');
    expect(await h.fakeRedis.current.get('ai:answered:m3')).toBeNull();
    await run(job('m3'));
    expect(mocks.outboundAdd).toHaveBeenCalledTimes(2);
  });

  it('a resposta da IA zera a contagem de mensagem repetida', async () => {
    await h.fakeRedis.current.set('ai:repeat:cv1', JSON.stringify({ h: 'x', n: 3 }));
    await run(job('m3'));
    expect(await h.fakeRedis.current.get('ai:repeat:cv1')).toBeNull();
  });
});
