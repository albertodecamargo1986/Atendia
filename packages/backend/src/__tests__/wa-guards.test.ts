import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeRedis } from './helpers/fake-redis.js';

const { fakeRedis } = vi.hoisted(() => ({ fakeRedis: { current: null as any } }));
vi.mock('../lib/redis.js', () => ({
  default: new Proxy({}, { get: (_t, prop) => (fakeRedis.current as any)[prop] }),
}));

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
} from '../lib/wa-guards.js';

describe('wa-guards (Redis)', () => {
  beforeEach(() => {
    fakeRedis.current = createFakeRedis();
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
});
