import { describe, it, expect } from 'vitest';
import { AutoSendLimiter, AUTO_LIMITS } from '../lib/wa-rate.js';

describe('teto de envios automáticos por número', () => {
  it('20 respostas automáticas simultâneas: só 10 saem no minuto, as outras esperam (não são descartadas)', () => {
    const l = new AutoSendLimiter();
    const t0 = 1_000_000;
    const waits = Array.from({ length: 20 }, () => l.reserve('s1', 'auto', t0).waitMs);
    expect(waits.filter((w) => w === 0)).toHaveLength(10);
    expect(waits.filter((w) => w > 0).every((w) => w <= 60_000)).toBe(true);
    // passado 1 minuto, abrem novas vagas
    expect(l.reserve('s1', 'auto', t0 + 60_001).waitMs).toBe(0);
  });

  it('250/h: a 251ª espera mesmo espaçada', () => {
    const l = new AutoSendLimiter();
    let t = 0;
    for (let i = 0; i < AUTO_LIMITS.autoPerHour; i++) {
      expect(l.reserve('s1', 'auto', t).waitMs).toBe(0);
      t += 7_000; // ~8,5/min, sempre abaixo de 10/min
    }
    expect(l.reserve('s1', 'auto', t).waitMs).toBeGreaterThan(0);
  });

  it('teto combinado com campanha: 15/min', () => {
    const l = new AutoSendLimiter();
    for (let i = 0; i < 10; i++) l.reserve('s1', 'auto', 0);
    for (let i = 0; i < 5; i++) expect(l.reserve('s1', 'campaign', 0).waitMs).toBe(0);
    expect(l.reserve('s1', 'campaign', 0).waitMs).toBeGreaterThan(0);
  });

  it('números diferentes não dividem o teto', () => {
    const l = new AutoSendLimiter();
    for (let i = 0; i < 10; i++) l.reserve('a', 'auto', 0);
    expect(l.reserve('b', 'auto', 0).waitMs).toBe(0);
  });

  it('avisa o painel a 70% (uma vez por minuto)', () => {
    const l = new AutoSendLimiter();
    const warns = Array.from({ length: 10 }, () => l.reserve('s1', 'auto', 0).warn);
    expect(warns.indexOf(true)).toBe(6); // 7ª mensagem = 70% de 10
    expect(warns.filter(Boolean)).toHaveLength(1);
  });
});
