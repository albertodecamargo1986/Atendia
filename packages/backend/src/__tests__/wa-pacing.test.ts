import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  decideReconnect,
  reconnectBackoffMs,
  typingDelayMs,
  KeyedSerializer,
  MIN_GAP_BETWEEN_SENDS_MS,
  zonedParts,
  isWithinCampaignWindow,
  nextCampaignWindowStart,
  campaignDailyQuota,
  campaignGapMs,
  campaignBatchPauseMs,
  needsBatchPause,
  startOfZonedDay,
  recordDisconnect,
  MAX_DISCONNECTS_PER_HOUR,
  TimeoutError,
  SERIALIZER_TASK_TIMEOUT_MS,
} from '../lib/wa-pacing.js';

// Instantes em UTC; São Paulo = UTC-3 (sem horário de verão)
const sp = (isoLocal: string) => new Date(`${isoLocal}-03:00`);

describe('decideReconnect — decisão por DisconnectReason (anti-banimento)', () => {
  it('401 loggedOut: apaga credenciais, DISCONNECTED, NÃO reconecta', () => {
    expect(decideReconnect(401)).toMatchObject({ action: 'logged_out', reconnect: false, clearCreds: true, status: 'DISCONNECTED' });
  });

  it('440 connectionReplaced: NÃO reconecta (evita ping-pong entre sessões)', () => {
    expect(decideReconnect(440)).toMatchObject({ action: 'replaced', reconnect: false, clearCreds: false, status: 'DISCONNECTED', reason: 'CONNECTION_REPLACED' });
  });

  it('403 forbidden: BANNED e para', () => {
    expect(decideReconnect(403)).toMatchObject({ action: 'banned', reconnect: false, status: 'BANNED' });
  });

  it('500 badSession: tenta 1x; na repetição apaga credenciais e pede QR (sem loop)', () => {
    expect(decideReconnect(500)).toMatchObject({ action: 'retry_once', reconnect: true, clearCreds: false });
    expect(decideReconnect(500, { badSessionRetried: true })).toMatchObject({ action: 'reset', reconnect: false, clearCreds: true, reason: 'NEW_QR_REQUIRED' });
  });

  it('411 multideviceMismatch: apaga credenciais e pede QR, sem reconectar', () => {
    expect(decideReconnect(411)).toMatchObject({ action: 'reset', reconnect: false, clearCreds: true });
  });

  it('405 client_too_old: tenta 1x com versão nova; se repetir, para', () => {
    expect(decideReconnect(405)).toMatchObject({ action: 'version_outdated', reconnect: true });
    expect(decideReconnect(405, { versionRetried: true })).toMatchObject({ reconnect: false, status: 'DISCONNECTED', reason: 'CLIENT_TOO_OLD' });
  });

  it('515 restartRequired: reconecta', () => {
    expect(decideReconnect(515)).toMatchObject({ action: 'restart', reconnect: true });
  });

  it('demais códigos com login: backoff; sem login (QR não lido): não gera QR sozinho', () => {
    for (const code of [408, 428, 503, undefined]) {
      expect(decideReconnect(code, { registered: true }).action).toBe('backoff');
      expect(decideReconnect(code, { registered: false })).toMatchObject({ action: 'qr_expired', reconnect: false });
    }
  });

  it('quedas demais em 1 h: para de reconectar (UNSTABLE)', () => {
    expect(decideReconnect(428, { recentDisconnects: MAX_DISCONNECTS_PER_HOUR })).toMatchObject({ action: 'backoff' });
    expect(decideReconnect(428, { recentDisconnects: MAX_DISCONNECTS_PER_HOUR + 1 })).toMatchObject({ action: 'unstable', reconnect: false, reason: 'UNSTABLE' });
  });

  it('recordDisconnect conta só a última hora', () => {
    const h: number[] = [];
    const t0 = 1_000_000_000;
    recordDisconnect(h, t0);
    recordDisconnect(h, t0 + 1000);
    expect(recordDisconnect(h, t0 + 3600_000 + 500)).toBe(2); // o 1º saiu da janela
  });
});

describe('reconnectBackoffMs — exponencial com jitter e teto', () => {
  it('min(5000·2^(n−1), 300000)·(0.8..1.2)', () => {
    expect(reconnectBackoffMs(1, () => 0)).toBe(4000);
    expect(reconnectBackoffMs(1, () => 1)).toBe(6000);
    expect(reconnectBackoffMs(3, () => 0.5)).toBe(20000);
    expect(reconnectBackoffMs(10, () => 1)).toBe(360000); // teto 300 s · 1.2
    expect(reconnectBackoffMs(20, () => 0)).toBe(240000);
  });
});

describe('typingDelayMs — "digitando..." proporcional ao texto', () => {
  it('clamp(len·45, 1500, 8000) + jitter 0..1500', () => {
    expect(typingDelayMs(1, () => 0)).toBe(1500);
    expect(typingDelayMs(100, () => 0)).toBe(4500);
    expect(typingDelayMs(10_000, () => 0)).toBe(8000);
    expect(typingDelayMs(10_000, () => 1)).toBe(9500);
  });
});

describe('KeyedSerializer — um envio por vez por número', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('nunca executa 2 tarefas do mesmo número em paralelo e respeita 1,2 s entre elas', async () => {
    vi.useFakeTimers();
    const serializer = new KeyedSerializer();
    let running = 0;
    let maxRunning = 0;
    const starts: number[] = [];
    const ends: number[] = [];
    const task = () => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      starts.push(Date.now());
      await new Promise((r) => setTimeout(r, 300));
      ends.push(Date.now());
      running--;
    };
    const all = Promise.all([1, 2, 3].map(() => serializer.run('sessao-1', task())));
    await vi.runAllTimersAsync();
    await all;
    expect(maxRunning).toBe(1);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - ends[i - 1]).toBeGreaterThanOrEqual(MIN_GAP_BETWEEN_SENDS_MS);
    }
  });

  it('números diferentes rodam em paralelo; erro de uma tarefa não trava a fila', async () => {
    vi.useFakeTimers();
    const serializer = new KeyedSerializer();
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 100));
      running--;
    };
    const p = Promise.all([serializer.run('a', task), serializer.run('b', task)]);
    await vi.runAllTimersAsync();
    await p;
    expect(maxRunning).toBe(2);

    const failing = serializer.run('a', async () => { throw new Error('falhou'); });
    const after = serializer.run('a', async () => 'ok');
    await vi.runAllTimersAsync();
    await expect(failing).rejects.toThrow('falhou');
    await expect(after).resolves.toBe('ok');
  });
});

describe('KeyedSerializer — tarefa travada não trava o número', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('tarefa que passa de 90 s é abandonada com erro e a fila do número segue', async () => {
    vi.useFakeTimers();
    const serializer = new KeyedSerializer();
    const stuck = serializer.run('s', () => new Promise(() => {}));
    const next = serializer.run('s', async () => 'segue');
    const assertion = expect(stuck).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(SERIALIZER_TASK_TIMEOUT_MS + 2_000);
    await assertion;
    await expect(next).resolves.toBe('segue');
  });
});

describe('Fuso America/Sao_Paulo (Intl) e janela de campanha', () => {
  it('zonedParts converte UTC para a hora de Brasília', () => {
    const p = zonedParts(new Date('2026-10-05T12:30:00Z'));
    expect(p).toMatchObject({ year: 2026, month: 10, day: 5, hour: 9, minute: 30, dayOfWeek: 1 });
  });

  it('janela seg–sex 9h–19h', () => {
    expect(isWithinCampaignWindow(sp('2026-10-05T08:59:00'))).toBe(false); // segunda 8:59
    expect(isWithinCampaignWindow(sp('2026-10-05T09:00:00'))).toBe(true);
    expect(isWithinCampaignWindow(sp('2026-10-05T18:59:00'))).toBe(true);
    expect(isWithinCampaignWindow(sp('2026-10-05T19:00:00'))).toBe(false);
    expect(isWithinCampaignWindow(sp('2026-10-03T10:00:00'))).toBe(false); // sábado
    expect(isWithinCampaignWindow(sp('2026-10-04T10:00:00'))).toBe(false); // domingo
  });

  it('próximo início de janela: sexta 19:30 → segunda 9:00; antes das 9h → hoje 9:00', () => {
    expect(nextCampaignWindowStart(sp('2026-10-02T19:30:00')).toISOString()).toBe(sp('2026-10-05T09:00:00').toISOString());
    expect(nextCampaignWindowStart(sp('2026-10-05T07:00:00')).toISOString()).toBe(sp('2026-10-05T09:00:00').toISOString());
    // Cota estourada: pula o dia mesmo que ainda seja de manhã
    expect(nextCampaignWindowStart(sp('2026-10-05T07:00:00'), { skipToday: true }).toISOString()).toBe(sp('2026-10-06T09:00:00').toISOString());
  });

  it('início do dia no fuso', () => {
    expect(startOfZonedDay(sp('2026-10-05T23:30:00')).toISOString()).toBe(sp('2026-10-05T00:00:00').toISOString());
  });
});

describe('Cota diária e ritmo de campanha', () => {
  const now = new Date('2026-10-05T15:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  it('aquecimento: 20/dia no início, +20%/dia, até 200 a partir de 14 dias', () => {
    expect(campaignDailyQuota(daysAgo(0), now)).toBe(20);
    expect(campaignDailyQuota(daysAgo(1), now)).toBe(24);
    expect(campaignDailyQuota(daysAgo(5), now)).toBe(49);
    expect(campaignDailyQuota(daysAgo(12), now)).toBe(178);
    expect(campaignDailyQuota(daysAgo(13), now)).toBe(200);
    expect(campaignDailyQuota(daysAgo(14), now)).toBe(200);
    expect(campaignDailyQuota(daysAgo(400), now)).toBe(200);
    expect(campaignDailyQuota(null, now)).toBe(20);
  });

  it('25–60 s entre envios e pausa de 10–20 min a cada 25', () => {
    expect(campaignGapMs(() => 0)).toBe(25_000);
    expect(campaignGapMs(() => 1)).toBe(60_000);
    expect(campaignBatchPauseMs(() => 0)).toBe(600_000);
    expect(campaignBatchPauseMs(() => 1)).toBe(1_200_000);
    expect(needsBatchPause(24)).toBe(false);
    expect(needsBatchPause(25)).toBe(true);
    expect(needsBatchPause(50)).toBe(true);
    expect(needsBatchPause(0)).toBe(false);
  });
});
