/**
 * Camada de provedor do WhatsApp: cada sessão é BAILEYS (QR Code, padrão) ou CLOUD_API (oficial
 * da Meta). Aqui ficam a consulta do provedor (com cache curto), as credenciais decifradas da
 * API oficial e a regra da janela de 24 h.
 *
 * Falha ao consultar → trata como BAILEYS: o envio cai no caminho do QR Code, que sem socket
 * aberto recusa com "sessão não encontrada" (nunca envia pelo caminho errado).
 */
import prisma from './prisma.js';
import { decryptSecret } from './secret-box.js';
import type { CloudCreds } from './wa-cloud-api.js';

export type WhatsAppProviderKind = 'BAILEYS' | 'CLOUD_API';

/** Janela da Meta para mensagens livres: 24 h desde a última mensagem do cliente. */
export const CLOUD_WINDOW_MS = 24 * 3600_000;
export const OUTSIDE_WINDOW_TEXT = 'Fora da janela de 24h — use um modelo aprovado.';

export function isInsideCustomerWindow(lastCustomerMessageAt: Date | string | null | undefined, now: number = Date.now()): boolean {
  if (!lastCustomerMessageAt) return false;
  const t = new Date(lastCustomerMessageAt).getTime();
  return Number.isFinite(t) && now - t < CLOUD_WINDOW_MS;
}

export function customerWindowEndsAt(lastCustomerMessageAt: Date | string | null | undefined): Date | null {
  if (!lastCustomerMessageAt) return null;
  const t = new Date(lastCustomerMessageAt).getTime();
  return Number.isFinite(t) ? new Date(t + CLOUD_WINDOW_MS) : null;
}

/** Envio livre (texto/mídia) pela API oficial fora da janela. */
export class OutsideWindowError extends Error {
  readonly outsideWindow = true;
  constructor() {
    super(OUTSIDE_WINDOW_TEXT);
  }
}

export interface CloudConfigStored {
  wabaId?: string | null;
  accessTokenEnc?: string | null;
  appSecretEnc?: string | null;
  verifyToken?: string | null;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  qualityRating?: string | null;
  messagingLimitTier?: string | null;
  lastTestedAt?: string | null;
  lastTestOk?: boolean | null;
  lastError?: string | null;
  accessTokenLast4?: string | null;
  appSecretLast4?: string | null;
}

export interface CloudSessionRecord {
  dbSessionId: string;
  sessionId: string;
  tenantId: string;
  status: string;
  phoneNumberId: string;
  wabaId: string | null;
  accessToken: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  config: CloudConfigStored;
}

const CACHE_MS = 60_000;
const providerCache = new Map<string, { provider: WhatsAppProviderKind; at: number }>();
const cloudCache = new Map<string, { rec: CloudSessionRecord; at: number }>();

function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

export function toCloudRecord(row: {
  id: string; sessionId: string; tenantId: string; status: string;
  cloudPhoneNumberId: string | null; cloudConfig: unknown;
}): CloudSessionRecord | null {
  if (!row.cloudPhoneNumberId) return null;
  const config = (row.cloudConfig && typeof row.cloudConfig === 'object' ? row.cloudConfig : {}) as CloudConfigStored;
  return {
    dbSessionId: row.id,
    sessionId: row.sessionId,
    tenantId: row.tenantId,
    status: row.status,
    phoneNumberId: row.cloudPhoneNumberId,
    wabaId: config.wabaId ?? null,
    accessToken: safeDecrypt(config.accessTokenEnc),
    appSecret: safeDecrypt(config.appSecretEnc),
    verifyToken: config.verifyToken ?? null,
    config,
  };
}

const CLOUD_SELECT = {
  id: true, sessionId: true, tenantId: true, status: true, provider: true, cloudPhoneNumberId: true, cloudConfig: true,
} as const;

/** Provedor da sessão (pelo sessionId interno, não o id do banco). */
export async function getSessionProvider(sessionId: string): Promise<WhatsAppProviderKind> {
  const hit = providerCache.get(sessionId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.provider;
  try {
    const row = await prisma.whatsAppSession.findUnique({ where: { sessionId }, select: { provider: true } });
    const provider: WhatsAppProviderKind = row?.provider === 'CLOUD_API' ? 'CLOUD_API' : 'BAILEYS';
    providerCache.set(sessionId, { provider, at: Date.now() });
    return provider;
  } catch (err: any) {
    console.warn(`[WhatsApp] não foi possível consultar o tipo de conexão de ${sessionId}: ${err?.message}`);
    return 'BAILEYS';
  }
}

/** Sessão oficial (credenciais decifradas) pelo sessionId interno; null se não for CLOUD_API. */
export async function getCloudSession(sessionId: string, opts: { fresh?: boolean } = {}): Promise<CloudSessionRecord | null> {
  const hit = cloudCache.get(sessionId);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.rec;
  const row = await prisma.whatsAppSession.findUnique({ where: { sessionId }, select: CLOUD_SELECT });
  if (!row || row.provider !== 'CLOUD_API') return null;
  const rec = toCloudRecord(row);
  if (rec) cloudCache.set(sessionId, { rec, at: Date.now() });
  return rec;
}

/** Sessão oficial pelo id do banco (webhook). */
export async function getCloudSessionByDbId(dbSessionId: string): Promise<CloudSessionRecord | null> {
  const row = await prisma.whatsAppSession.findUnique({ where: { id: dbSessionId }, select: CLOUD_SELECT });
  if (!row || row.provider !== 'CLOUD_API') return null;
  return toCloudRecord(row);
}

export function cloudCreds(rec: CloudSessionRecord): CloudCreds {
  if (!rec.accessToken) throw new Error('Token de acesso da Meta não configurado neste número');
  return { phoneNumberId: rec.phoneNumberId, accessToken: rec.accessToken, wabaId: rec.wabaId };
}

/** Depois de criar/editar/excluir/testar uma sessão: esquece o cache. */
export function invalidateProviderCache(sessionId?: string) {
  if (sessionId) {
    providerCache.delete(sessionId);
    cloudCache.delete(sessionId);
  } else {
    providerCache.clear();
    cloudCache.clear();
  }
}
