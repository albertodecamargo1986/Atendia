/**
 * Regras de ritmo e de reconexão do WhatsApp (funções puras — testáveis sem Baileys).
 *
 * Objetivo nº 1: o número do cliente NÃO pode parecer um robô para o WhatsApp.
 *  - reconexão com backoff + jitter, sem loop em erros definitivos (401/403/440/500/411);
 *  - um envio por vez por número, com "digitando..." proporcional ao texto;
 *  - campanhas lentas (25–60 s entre envios, pausas longas), com cota diária e janela comercial.
 */

// ─── Reconexão (DisconnectReason do Baileys) ────────────────────────────────

/** Códigos de desconexão do Baileys 6.7.x (DisconnectReason). */
export const WA_DISCONNECT = {
  connectionClosed: 428,
  connectionLost: 408,
  timedOut: 408,
  loggedOut: 401,
  forbidden: 403,
  /** Sem enum no Baileys: "client_too_old" — versão do WhatsApp Web desatualizada. */
  clientTooOld: 405,
  multideviceMismatch: 411,
  connectionReplaced: 440,
  badSession: 500,
  unavailableService: 503,
  restartRequired: 515,
} as const;

export type ReconnectAction =
  /** 401: o aparelho desconectou — apaga credenciais, DISCONNECTED, não reconecta. */
  | 'logged_out'
  /** 440: a conta abriu em outro lugar — DISCONNECTED, NÃO reconecta (evita "briga" de sessões). */
  | 'replaced'
  /** 403: número bloqueado/banido — BANNED, para tudo e avisa o painel. */
  | 'banned'
  /** 500 (2ª vez seguida) / 411: sessão corrompida — apaga credenciais, pede novo QR, sem loop. */
  | 'reset'
  /** 500 (1ª vez): tenta reconectar UMA vez antes de apagar as credenciais. */
  | 'retry_once'
  /** 405: versão do WhatsApp Web velha — busca a versão atual e tenta 1x; se repetir, para. */
  | 'version_outdated'
  /** Quedas demais em 1 h (ex.: 428 em ciclo) — para e pede atenção. */
  | 'unstable'
  /** 515: reinício pedido pelo servidor (normal após ler o QR) — reconecta 1x em ~1 s. */
  | 'restart'
  /** Sessão ainda sem login (QR não lido/expirado) — não gera QR novo sozinho. */
  | 'qr_expired'
  /** Queda transitória — reconecta com backoff exponencial + jitter (máx. 10). */
  | 'backoff';

export interface ReconnectDecision {
  action: ReconnectAction;
  reconnect: boolean;
  /** Apagar a pasta de credenciais (exige novo QR). */
  clearCreds: boolean;
  /** Status gravado no banco. */
  status: 'DISCONNECTED' | 'BANNED' | 'CONNECTING';
  /** Motivo enviado ao painel. */
  reason?: string;
}

/**
 * Decide o que fazer quando a conexão fecha.
 * @param code statusCode do Boom em lastDisconnect.error
 * @param opts.registered a sessão já tem login (creds.me) — sem login não há reconexão automática
 */
export function decideReconnect(
  code: number | undefined,
  opts: {
    registered?: boolean;
    /** Já houve um 500 seguido de tentativa sem chegar a conectar. */
    badSessionRetried?: boolean;
    /** Já houve um 405 seguido de tentativa com versão nova sem chegar a conectar. */
    versionRetried?: boolean;
    /** Quedas "transitórias" na última hora (incluindo esta). */
    recentDisconnects?: number;
  } = {},
): ReconnectDecision {
  const registered = opts.registered ?? true;
  switch (code) {
    case WA_DISCONNECT.loggedOut:
      return { action: 'logged_out', reconnect: false, clearCreds: true, status: 'DISCONNECTED', reason: 'LOGGED_OUT' };
    case WA_DISCONNECT.connectionReplaced:
      return {
        action: 'replaced', reconnect: false, clearCreds: false, status: 'DISCONNECTED',
        reason: 'CONNECTION_REPLACED',
      };
    case WA_DISCONNECT.forbidden:
      return { action: 'banned', reconnect: false, clearCreds: false, status: 'BANNED', reason: 'BANNED' };
    case WA_DISCONNECT.badSession:
      if (!opts.badSessionRetried) {
        return { action: 'retry_once', reconnect: true, clearCreds: false, status: 'CONNECTING' };
      }
      return { action: 'reset', reconnect: false, clearCreds: true, status: 'DISCONNECTED', reason: 'NEW_QR_REQUIRED' };
    case WA_DISCONNECT.multideviceMismatch:
      return { action: 'reset', reconnect: false, clearCreds: true, status: 'DISCONNECTED', reason: 'NEW_QR_REQUIRED' };
    case WA_DISCONNECT.clientTooOld:
      if (!opts.versionRetried) {
        return { action: 'version_outdated', reconnect: true, clearCreds: false, status: 'CONNECTING' };
      }
      return { action: 'version_outdated', reconnect: false, clearCreds: false, status: 'DISCONNECTED', reason: 'CLIENT_TOO_OLD' };
    case WA_DISCONNECT.restartRequired:
      return { action: 'restart', reconnect: true, clearCreds: false, status: 'CONNECTING' };
    default:
      if (!registered) {
        return { action: 'qr_expired', reconnect: false, clearCreds: false, status: 'DISCONNECTED', reason: 'QR_EXPIRED' };
      }
      if ((opts.recentDisconnects ?? 0) > MAX_DISCONNECTS_PER_HOUR) {
        return { action: 'unstable', reconnect: false, clearCreds: false, status: 'DISCONNECTED', reason: 'UNSTABLE' };
      }
      return { action: 'backoff', reconnect: true, clearCreds: false, status: 'CONNECTING' };
  }
}

/** Mais que isso de quedas transitórias em 1 h = conexão instável: para de reconectar sozinho. */
export const MAX_DISCONNECTS_PER_HOUR = 6;

/** Registra uma queda e devolve quantas houve na última hora (janela deslizante). */
export function recordDisconnect(history: number[], now: number = Date.now()): number {
  const cutoff = now - 3600_000;
  while (history.length && history[0] < cutoff) history.shift();
  history.push(now);
  return history.length;
}

/** Mensagem amigável para o painel, por motivo de desconexão. */
export const DISCONNECT_REASON_TEXT: Record<string, string> = {
  LOGGED_OUT: 'O WhatsApp foi desconectado pelo celular. Leia o QR Code novamente.',
  CONNECTION_REPLACED: 'Este WhatsApp foi conectado em outro lugar. Reconecte quando quiser voltar a usar aqui.',
  BANNED: 'O WhatsApp bloqueou este número. Verifique o aplicativo no celular.',
  NEW_QR_REQUIRED: 'A sessão ficou inválida. Leia o QR Code novamente.',
  QR_EXPIRED: 'O QR Code expirou. Clique em reconectar para gerar outro.',
  CLIENT_TOO_OLD: 'A versão do WhatsApp Web usada está desatualizada. Atualize o sistema e reconecte.',
  UNSTABLE: 'A conexão caiu muitas vezes na última hora. Reconexão automática pausada: verifique o celular e reconecte.',
  RESTRICTED: 'O WhatsApp limitou temporariamente este número; envios automáticos pausados por 24h.',
  MAX_ATTEMPTS: 'Não foi possível reconectar após várias tentativas.',
};

export const MAX_RECONNECT_ATTEMPTS = 10;
/** A contagem de tentativas só zera depois de 60 s conectado de forma estável. */
export const STABLE_CONNECTION_MS = 60_000;
export const RESTART_REQUIRED_DELAY_MS = 1_000;

/** Backoff: min(5000·2^(n−1), 300000) · (0.8 + random·0.4). */
export function reconnectBackoffMs(attempt: number, random: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(attempt));
  const base = Math.min(5000 * Math.pow(2, n - 1), 300_000);
  return Math.round(base * (0.8 + random() * 0.4));
}

// ─── Ritmo humano no envio ──────────────────────────────────────────────────

export const MIN_GAP_BETWEEN_SENDS_MS = 1_200;

/** "Digitando..." proporcional ao texto: clamp(len·45 ms, 1,5 s, 8 s) + jitter(0..1,5 s). */
export function typingDelayMs(textLength: number, random: () => number = Math.random): number {
  const base = Math.min(Math.max(Math.max(0, textLength) * 45, 1500), 8000);
  return Math.round(base + random() * 1500);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Fila em memória por chave (sessão): executa UMA tarefa por vez por número e garante
 * um intervalo mínimo entre o fim de uma e o início da próxima. Chaves diferentes
 * (números diferentes) rodam em paralelo.
 */
export class KeyedSerializer {
  private tails = new Map<string, Promise<unknown>>();
  private lastEnd = new Map<string, number>();

  constructor(
    private readonly minGapMs = MIN_GAP_BETWEEN_SENDS_MS,
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(async () => {
      const last = this.lastEnd.get(key);
      if (last !== undefined) {
        const elapsed = this.now() - last;
        if (elapsed < this.minGapMs) await this.wait(this.minGapMs - elapsed);
      }
      try {
        return await task();
      } finally {
        this.lastEnd.set(key, this.now());
      }
    });
    const tail = result.catch(() => undefined);
    this.tails.set(key, tail);
    // Libera memória quando a fila daquela chave esvazia
    tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  /** Quantidade de chaves com tarefas em andamento (diagnóstico/testes). */
  get size(): number {
    return this.tails.size;
  }
}

// ─── Fuso horário (Intl, sem dependências) ──────────────────────────────────

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export interface ZonedParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  /** 0 = domingo ... 6 = sábado */
  dayOfWeek: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Data/hora "de parede" no fuso informado (padrão America/Sao_Paulo). */
export function zonedParts(date: Date, timeZone: string = DEFAULT_TIMEZONE): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of getFormatter(timeZone).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    dayOfWeek: WEEKDAYS[parts.weekday] ?? 0,
  };
}

/** Converte uma data/hora "de parede" no fuso em instante UTC. */
export function zonedTimeToUtc(
  year: number, month: number, day: number, hour: number, minute: number,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // offset = (hora de parede do palpite) − palpite; duas passadas resolvem bordas de horário de verão
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(ts), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    ts = guess - (asUtc - ts);
  }
  return new Date(ts);
}

/** Chave do dia (YYYY-MM-DD) no fuso. */
export function zonedDayKey(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Início (00:00) do dia no fuso, como instante UTC. */
export function startOfZonedDay(date: Date, timeZone: string = DEFAULT_TIMEZONE): Date {
  const p = zonedParts(date, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, timeZone);
}

// ─── Campanhas: política conservadora ───────────────────────────────────────

export const CAMPAIGN_WINDOW_START_HOUR = 9;
export const CAMPAIGN_WINDOW_END_HOUR = 19;
export const CAMPAIGN_MIN_GAP_MS = 25_000;
export const CAMPAIGN_MAX_GAP_MS = 60_000;
export const CAMPAIGN_BATCH_SIZE = 25;
export const CAMPAIGN_BATCH_PAUSE_MIN_MS = 10 * 60_000;
export const CAMPAIGN_BATCH_PAUSE_MAX_MS = 20 * 60_000;
export const CAMPAIGN_DAILY_QUOTA = 200;
export const CAMPAIGN_WARMUP_START = 20;
export const CAMPAIGN_WARMUP_DAYS = 14;
/** Só recebe campanha quem mandou mensagem nos últimos N dias. */
export const CAMPAIGN_RECENT_CONTACT_DAYS = 90;

function randomBetween(min: number, max: number, random: () => number): number {
  return Math.round(min + random() * (max - min));
}

/** Espera antes de cada envio de campanha: 25–60 s aleatório. */
export function campaignGapMs(random: () => number = Math.random): number {
  return randomBetween(CAMPAIGN_MIN_GAP_MS, CAMPAIGN_MAX_GAP_MS, random);
}

/** Pausa longa a cada 25 envios: 10–20 min. */
export function campaignBatchPauseMs(random: () => number = Math.random): number {
  return randomBetween(CAMPAIGN_BATCH_PAUSE_MIN_MS, CAMPAIGN_BATCH_PAUSE_MAX_MS, random);
}

/** true quando, depois de `sentInRun` envios, é hora da pausa longa. */
export function needsBatchPause(sentInRun: number): boolean {
  return sentInRun > 0 && sentInRun % CAMPAIGN_BATCH_SIZE === 0;
}

/**
 * Cota diária de campanha por número.
 * Número conectado há < 14 dias: começa em 20/dia e cresce 20%/dia até 200.
 */
export function campaignDailyQuota(connectedSince: Date | null | undefined, now: Date = new Date()): number {
  if (!connectedSince) return CAMPAIGN_WARMUP_START;
  const days = Math.floor((now.getTime() - connectedSince.getTime()) / 86_400_000);
  if (days >= CAMPAIGN_WARMUP_DAYS) return CAMPAIGN_DAILY_QUOTA;
  const quota = Math.floor(CAMPAIGN_WARMUP_START * Math.pow(1.2, Math.max(0, days)));
  return Math.min(CAMPAIGN_DAILY_QUOTA, Math.max(CAMPAIGN_WARMUP_START, quota));
}

function isWeekday(dayOfWeek: number): boolean {
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

/** Janela de campanha: segunda a sexta, 9h–19h no fuso. */
export function isWithinCampaignWindow(date: Date, timeZone: string = DEFAULT_TIMEZONE): boolean {
  const p = zonedParts(date, timeZone);
  if (!isWeekday(p.dayOfWeek)) return false;
  const minutes = p.hour * 60 + p.minute;
  return minutes >= CAMPAIGN_WINDOW_START_HOUR * 60 && minutes < CAMPAIGN_WINDOW_END_HOUR * 60;
}

/**
 * Próximo início de janela (dia útil, 9h no fuso) estritamente depois de `date`.
 * Com `skipToday`, ignora o dia de `date` mesmo antes das 9h (usado quando a cota do dia acabou).
 */
export function nextCampaignWindowStart(
  date: Date,
  opts: { skipToday?: boolean; timeZone?: string } = {},
): Date {
  const timeZone = opts.timeZone ?? DEFAULT_TIMEZONE;
  const p = zonedParts(date, timeZone);
  // Meio-dia do dia local como âncora (evita bordas de fuso ao somar dias)
  const anchor = zonedTimeToUtc(p.year, p.month, p.day, 12, 0, timeZone);
  for (let offset = 0; offset < 10; offset++) {
    if (offset === 0 && opts.skipToday) continue;
    const day = zonedParts(new Date(anchor.getTime() + offset * 86_400_000), timeZone);
    if (!isWeekday(day.dayOfWeek)) continue;
    const start = zonedTimeToUtc(day.year, day.month, day.day, CAMPAIGN_WINDOW_START_HOUR, 0, timeZone);
    if (start.getTime() > date.getTime()) return start;
  }
  // Inalcançável (sempre há dia útil em 10 dias); por segurança, amanhã
  return new Date(date.getTime() + 86_400_000);
}
