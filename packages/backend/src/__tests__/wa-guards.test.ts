import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeRedis } from './helpers/fake-redis.js';

const { fakeRedis, mockPrisma } = vi.hoisted(() => ({
  fakeRedis: { current: null as any },
  mockPrisma: { whatsAppSession: { findUnique: vi.fn() } },
}));
vi.mock('../lib/redis.js', () => ({
  default: new Proxy({}, { get: (_t, prop) => (fakeRedis.current as any)[prop] }),
}));
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));

import {
  claimOnce,
  isDuplicateIncoming,
  countAiReply,
  resetAiReplyCounters,
  trackRepeatedMessage,
  shouldIgnoreRepeated,
  shouldRestrictOnAckError,
  countSendError,
  markSessionRestricted,
  getRestrictedUntil,
  RESTRICTION_PAUSE_MS,
  _resetRestrictionCache,
  incrWithTtl,
  resetRepeatedMessage,
  addRestrictionIncident,
  shouldDisableCampaigns,
  clearSessionRestriction,
} from '../lib/wa-guards.js';

describe('wa-guards (Redis)', () => {
  beforeEach(() => {
    fakeRedis.current = createFakeRedis();
    _resetRestrictionCache();
    mockPrisma.whatsAppSession.findUnique.mockReset().mockResolvedValue({ restrictedUntil: null });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('claimOnce: só a 1ª chamada pega a trava; expira depois do TTL (saudação/aviso 1x a cada 12 h)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    expect(await claimOnce('greeting:c1', 12 * 3600)).toBe(true);
    expect(await claimOnce('greeting:c1', 12 * 3600)).toBe(false);
    vi.setSystemTime(new Date('2026-10-06T00:00:01Z'));
    expect(await claimOnce('greeting:c1', 12 * 3600)).toBe(true);
  });

  it('dedupe por msg.key.id: a mesma mensagem só é processada 1x', async () => {
    expect(await isDuplicateIncoming('s1', 'MSG1')).toBe(false);
    expect(await isDuplicateIncoming('s1', 'MSG1')).toBe(true);
    expect(await isDuplicateIncoming('s2', 'MSG1')).toBe(false); // outro número
  });

  it('anti-loop: a 9ª resposta em 10 min é bloqueada', async () => {
    for (let i = 1; i <= 8; i++) expect((await countAiReply('conv')).allowed).toBe(true);
    expect((await countAiReply('conv')).allowed).toBe(false);
    await resetAiReplyCounters('conv');
    expect((await countAiReply('conv')).allowed).toBe(true);
  });

  it('anti-loop: mais de 30 respostas em 1 h é bloqueado mesmo espaçado', async () => {
    vi.useFakeTimers();
    let t = new Date('2026-10-05T12:00:00Z').getTime();
    vi.setSystemTime(t);
    let last = { allowed: true } as any;
    for (let i = 1; i <= 31; i++) {
      last = await countAiReply('conv2');
      if (i <= 30) expect(last.allowed).toBe(true);
      t += 100_000; // 31 respostas em ~51 min, nunca 9 em 10 min
      vi.setSystemTime(t);
    }
    expect(last.allowed).toBe(false);
  });

  it('mensagem idêntica repetida: ignora a partir da 4ª seguida', async () => {
    const counts = [];
    for (let i = 0; i < 5; i++) counts.push(await trackRepeatedMessage('c', 'Oi'));
    expect(counts).toEqual([1, 2, 3, 4, 5]);
    expect(counts.map(shouldIgnoreRepeated)).toEqual([false, false, false, true, true]);
    expect(await trackRepeatedMessage('c', 'outra')).toBe(1);
  });

  it('restrição: 463/475 pausa na hora; outros erros a partir do 3º em 10 min', async () => {
    expect(shouldRestrictOnAckError('463', 1)).toBe(true);
    expect(shouldRestrictOnAckError(475, 1)).toBe(true);
    expect(shouldRestrictOnAckError('479', 1)).toBe(false);
    expect(await countSendError('s1')).toBe(1);
    expect(await countSendError('s1')).toBe(2);
    expect(shouldRestrictOnAckError('479', await countSendError('s1'))).toBe(true);
  });

  it('recupera pausa persistida ap?s o Redis perder os dados', async () => {
    const until = new Date(Date.now() + RESTRICTION_PAUSE_MS);
    mockPrisma.whatsAppSession.findUnique.mockResolvedValue({ restrictedUntil: until });
    const recovered = await getRestrictedUntil('session-persistida');
    expect(recovered?.getTime()).toBe(until.getTime());
    expect(await fakeRedis.current.get('wa:restricted:session-persistida')).toBe(String(until.getTime()));
  });

  it('restrição: marca por 24 h e libera sozinha', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    const until = new Date(Date.now() + RESTRICTION_PAUSE_MS);
    await markSessionRestricted('s1', until);
    expect((await getRestrictedUntil('s1'))?.toISOString()).toBe(until.toISOString());
    expect(await getRestrictedUntil('s2')).toBeNull();
    vi.setSystemTime(new Date(until.getTime() + 1000));
    expect(await getRestrictedUntil('s1')).toBeNull();
  });

  it('INCR + EXPIRE atômicos (Lua): a chave já nasce com expiração', async () => {
    const spy = vi.spyOn(fakeRedis.current, 'eval');
    expect(await incrWithTtl('k', 600)).toBe(1);
    expect(await incrWithTtl('k', 600)).toBe(2);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('EXPIRE'), 1, 'k', 600);
    expect(fakeRedis.current.store.get('k').expiresAt).not.toBeNull();
  });

  it('repetição: rótulos de mídia não contam (4 fotos seguidas → IA responde)', async () => {
    const counts = [];
    for (let i = 0; i < 4; i++) counts.push(await trackRepeatedMessage('c', '[Imagem]'));
    expect(counts.every((n) => !shouldIgnoreRepeated(n))).toBe(true);
    expect(await trackRepeatedMessage('c', '[Áudio] oi')).toBe(1);
  });

  it('repetição: só conta em sequência curta (3 min) e zera quando a IA responde', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    await trackRepeatedMessage('c2', 'menu');
    await trackRepeatedMessage('c2', 'menu');
    vi.setSystemTime(new Date('2026-10-05T12:04:00Z'));
    expect(await trackRepeatedMessage('c2', 'menu')).toBe(1); // passou da janela
    await trackRepeatedMessage('c2', 'menu');
    await resetRepeatedMessage('c2');
    expect(await trackRepeatedMessage('c2', 'menu')).toBe(1);
  });

  it('Redis apagado (flush) com restrictedUntil no banco: o envio automático continua bloqueado', async () => {
    const until = new Date(Date.now() + 3600_000);
    await markSessionRestricted('s-flush', until);
    fakeRedis.current.reset(); // FLUSHALL
    _resetRestrictionCache();
    mockPrisma.whatsAppSession.findUnique.mockResolvedValue({ restrictedUntil: until });
    expect((await getRestrictedUntil('s-flush'))?.getTime()).toBe(until.getTime());
    // consulta ao banco tem cache de 30 s (não é 1 consulta por envio)
    await getRestrictedUntil('s-other');
    await getRestrictedUntil('s-other');
    expect(mockPrisma.whatsAppSession.findUnique.mock.calls.filter((c: any[]) => c[0].where.sessionId === 's-other')).toHaveLength(1);
  });

  it('limpar restrição libera na hora', async () => {
    await markSessionRestricted('s-clear', new Date(Date.now() + 3600_000));
    await clearSessionRestriction('s-clear');
    expect(await getRestrictedUntil('s-clear')).toBeNull();
  });

  it('incidentes: guarda só 30 dias; a 2ª restrição em 30 dias desliga campanhas', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    const old = new Date(now.getTime() - 40 * 86_400_000).toISOString();
    const first = addRestrictionIncident([old], now);
    expect(first).toEqual([now.toISOString()]);
    expect(shouldDisableCampaigns(first)).toBe(false);
    const second = addRestrictionIncident(first, new Date(now.getTime() + 5 * 86_400_000));
    expect(shouldDisableCampaigns(second)).toBe(true);
  });
});
