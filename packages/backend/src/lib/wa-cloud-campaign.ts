/**
 * Campanha pela API oficial (Cloud API): só modelo aprovado pela Meta. Regras puras
 * (cota pelo "tier" da conta, variáveis do modelo, texto final para o histórico da conversa).
 */
import { personalizeMessage } from './spintax.js';

/** Intervalo entre envios da campanha oficial (a Meta controla o volume; o serializador continua valendo). */
export const CLOUD_CAMPAIGN_MIN_GAP_MS = 2_000;
export const CLOUD_CAMPAIGN_MAX_GAP_MS = 4_000;

export function cloudCampaignGapMs(random: () => number = Math.random): number {
  return Math.round(CLOUD_CAMPAIGN_MIN_GAP_MS + random() * (CLOUD_CAMPAIGN_MAX_GAP_MS - CLOUD_CAMPAIGN_MIN_GAP_MS));
}

const TIER_QUOTA: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_2K: 2_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: 100_000,
};

/** Contatos por dia permitidos pela Meta para o número (tier); desconhecido = 250 (o menor comum). */
export function tierDailyQuota(tier: string | null | undefined): number {
  return (tier && TIER_QUOTA[tier]) || 250;
}

export interface TemplateParamMapping {
  /** Nome da variável no modelo ("1", "2"... ou nomeada). */
  name: string;
  /** Valor: "{nome}" (primeiro nome do contato) ou texto fixo (aceita {a|b}). */
  value: string;
}

export function parseTemplateParams(raw: unknown): TemplateParamMapping[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is { name: unknown; value: unknown } => !!p && typeof p === 'object')
    .map((p) => ({ name: String(p.name ?? ''), value: String(p.value ?? '') }))
    .filter((p) => p.name);
}

/** Valores das variáveis para um contato (sem nome → "cliente", a Meta não aceita variável vazia). */
export function resolveTemplateParams(
  mapping: TemplateParamMapping[],
  contact: { name?: string | null },
  random: () => number = Math.random,
): { values: string[]; names: string[] | null } {
  const values = mapping.map((m) => personalizeMessage(m.value, contact, random) || 'cliente');
  const named = mapping.some((m) => !/^\d+$/.test(m.name));
  return { values, names: named ? mapping.map((m) => m.name) : null };
}

/** Texto do modelo com as variáveis preenchidas (fica gravado na conversa para dar contexto à IA). */
export function renderTemplateBody(body: string, mapping: TemplateParamMapping[], values: string[]): string {
  let out = String(body || '');
  mapping.forEach((m, i) => {
    out = out.split(new RegExp(`\\{\\{\\s*${m.name.replace(/[^A-Za-z0-9_]/g, '')}\\s*\\}\\}`, 'g')).join(values[i] ?? '');
  });
  return out;
}
