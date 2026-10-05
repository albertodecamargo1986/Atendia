/**
 * Teto de envios AUTOMÁTICOS por número (IA, saudação, aviso de fora do horário, opt-out, campanha).
 *
 *  - automáticas (sem campanha): no máx. 10/min e 250/h;
 *  - automáticas + campanha juntas: no máx. 15/min;
 *  - aviso ao painel a 70% de qualquer limite;
 *  - acima de 1500/dia o número tem as automações pausadas até o dia seguinte (feito pelo chamador).
 * O excedente NÃO é descartado: o chamador recebe quanto tempo esperar e reagenda.
 * Em memória (um processo de backend — ver relatório: não escalar para 2 réplicas).
 */

export type AutoKind = 'auto' | 'campaign';

export const AUTO_LIMITS = {
  autoPerMinute: 10,
  autoPerHour: 250,
  combinedPerMinute: 15,
  warnRatio: 0.7,
  dailyPause: 1500,
} as const;

const MINUTE = 60_000;
const HOUR = 3_600_000;

export interface ReserveResult {
  /** 0 = pode enviar agora (e o envio já foi contado); > 0 = espere esse tempo e tente de novo. */
  waitMs: number;
  /** Chegou a 70% de algum limite (avisar o painel). */
  warn: boolean;
}

export class AutoSendLimiter {
  private events = new Map<string, Array<{ t: number; kind: AutoKind }>>();
  private lastWarn = new Map<string, number>();

  private prune(sessionId: string, now: number) {
    const list = (this.events.get(sessionId) || []).filter((e) => now - e.t < HOUR);
    this.events.set(sessionId, list);
    return list;
  }

  reserve(sessionId: string, kind: AutoKind, now: number = Date.now()): ReserveResult {
    const list = this.prune(sessionId, now);
    const lastMinute = list.filter((e) => now - e.t < MINUTE);
    const autoMinute = lastMinute.filter((e) => e.kind === 'auto');
    const autoHour = list.filter((e) => e.kind === 'auto');

    let wait = 0;
    if (lastMinute.length >= AUTO_LIMITS.combinedPerMinute) {
      wait = Math.max(wait, lastMinute[lastMinute.length - AUTO_LIMITS.combinedPerMinute].t + MINUTE - now);
    }
    if (kind === 'auto') {
      if (autoMinute.length >= AUTO_LIMITS.autoPerMinute) {
        wait = Math.max(wait, autoMinute[autoMinute.length - AUTO_LIMITS.autoPerMinute].t + MINUTE - now);
      }
      if (autoHour.length >= AUTO_LIMITS.autoPerHour) {
        wait = Math.max(wait, autoHour[autoHour.length - AUTO_LIMITS.autoPerHour].t + HOUR - now);
      }
    }
    if (wait > 0) return { waitMs: Math.ceil(wait), warn: false };

    list.push({ t: now, kind });
    const autoMin = autoMinute.length + (kind === 'auto' ? 1 : 0);
    const autoHr = autoHour.length + (kind === 'auto' ? 1 : 0);
    const combined = lastMinute.length + 1;
    const reached =
      autoMin >= AUTO_LIMITS.autoPerMinute * AUTO_LIMITS.warnRatio ||
      autoHr >= AUTO_LIMITS.autoPerHour * AUTO_LIMITS.warnRatio ||
      combined >= AUTO_LIMITS.combinedPerMinute * AUTO_LIMITS.warnRatio;
    let warn = false;
    const lastWarn = this.lastWarn.get(sessionId);
    if (reached && (lastWarn === undefined || now - lastWarn >= MINUTE)) {
      this.lastWarn.set(sessionId, now);
      warn = true;
    }
    return { waitMs: 0, warn };
  }

  reset(sessionId?: string) {
    if (sessionId) {
      this.events.delete(sessionId);
      this.lastWarn.delete(sessionId);
    } else {
      this.events.clear();
      this.lastWarn.clear();
    }
  }
}
