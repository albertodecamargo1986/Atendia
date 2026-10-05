/**
 * Conexão OFICIAL do WhatsApp (Cloud API da Meta) — 2ª opção ao lado do QR Code (Baileys).
 *
 *  - Cadastro/edição/teste do número (credenciais cifradas; nunca devolvidas ao painel).
 *  - Webhook público: verificação (GET) e eventos (POST, assinatura X-Hub-Signature-256), processados
 *    em fila. Mensagens recebidas são normalizadas e entram pela MESMA função de entrada do QR Code
 *    (handleIncomingMessage: fila por número|contato, dedupe, opt-out, anti-loop, saudação 1x,
 *    aviso de fora do horário 1x/12 h, tickets, IA com debounce).
 *  - Status de entrega (enviada/entregue/lida/falhou) e erros da Meta → aviso ao operador e, nos
 *    erros de qualidade/limite, a mesma rotina de restrição do QR Code (pausa das automações).
 *  - Modelos aprovados (lista com cache de 1 h) para o operador fora da janela de 24 h e campanhas.
 */
import crypto, { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import { z } from 'zod';

import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';
import { getIO } from '../lib/socket.js';
import { ConflictError, LimitError, NotFoundError, ValidationError } from '../lib/errors.js';
import { isOverLimit } from '../lib/limits.js';
import { encryptSecret } from '../lib/secret-box.js';
import { tenantUploadDir } from '../lib/uploads.js';
import { incrWithTtl } from '../lib/wa-guards.js';
import { whatsappCloudWebhookQueue, whatsappOutboundQueue } from '../workers/queues.js';
import {
  CloudApiError,
  CloudNetworkError,
  describeCloudError,
  downloadCloudMedia,
  getCloudPhoneNumberInfo,
  listCloudTemplates,
  type CloudCreds,
  type CloudTemplate,
  type FetchLike,
} from '../lib/wa-cloud-api.js';
import {
  extractCloudChanges,
  isValidSignature,
  normalizeCloudMessage,
  normalizeCloudStatus,
  verifyWebhookChallenge,
  type CloudStatusEvent,
} from '../lib/wa-cloud-webhook.js';
import {
  cloudCreds,
  customerWindowEndsAt,
  getCloudSessionByDbId,
  invalidateProviderCache,
  isInsideCustomerWindow,
  toCloudRecord,
  OUTSIDE_WINDOW_TEXT,
  type CloudConfigStored,
  type CloudSessionRecord,
} from '../lib/wa-provider.js';

import {
  handleIncomingMessage,
  cleanupOrphanSessions,
  applyCloudRestriction,
  sendCloudSerialized,
  registerCloudSessionInfo,
  resolveConversationRoute,
  alertOwners,
  type SessionCtx,
} from './whatsapp.service.js';
import { mediaExtension } from './voice.service.js';
import { recordCampaignOutcome } from './campaign.service.js';
import { emitWebhookEvent } from './webhook.service.js';
import { updateTicket } from './ticket.service.js';

/** fetch lido na hora da chamada (os testes trocam o fetch global). */
const fetchImpl: FetchLike = (...args) => fetch(...args);

function emitToTenant(tenantId: string, event: string, payload: unknown) {
  try {
    getIO().to(`tenant:${tenantId}`).emit(event, payload);
  } catch { /* socket.io indisponível */ }
}

function emitMessage(tenantId: string, conversationId: string, message: unknown) {
  try {
    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('message:new', { conversationId, message });
    io.to(`conversation:${conversationId}`).emit('message:new', { conversationId, message });
  } catch { /* socket.io indisponível */ }
}

// ─── URL pública do webhook ─────────────────────────────────────────────────

/** Base pública (PUBLIC_URL) — a Meta só chama endereços HTTPS. */
export function getPublicBase() {
  const publicUrl = process.env.PUBLIC_URL?.trim().replace(/\/+$/, '') || null;
  return { publicUrl, httpsReady: !!publicUrl && publicUrl.startsWith('https://') };
}

export function webhookUrlFor(dbSessionId: string): string | null {
  const { publicUrl, httpsReady } = getPublicBase();
  return httpsReady && publicUrl ? `${publicUrl}/api/whatsapp/cloud/webhook/${dbSessionId}` : null;
}

// ─── Visão pública (sem segredos) ───────────────────────────────────────────

export interface CloudPublicInfo {
  phoneNumberId: string | null;
  wabaId: string | null;
  accessToken: { configured: boolean; last4: string | null };
  appSecret: { configured: boolean; last4: string | null };
  verifyToken: string | null;
  webhookUrl: string | null;
  httpsReady: boolean;
  publicUrl: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastError: string | null;
  /** Eventos do webhook recusados por assinatura inválida nas últimas ~24 h (App Secret errado?) */
  invalidSignatures24h?: number;
}

export function cloudPublicInfo(row: { id: string; cloudPhoneNumberId?: string | null; cloudConfig?: unknown }): CloudPublicInfo {
  const c = (row.cloudConfig && typeof row.cloudConfig === 'object' ? row.cloudConfig : {}) as CloudConfigStored;
  const { publicUrl, httpsReady } = getPublicBase();
  return {
    phoneNumberId: row.cloudPhoneNumberId ?? null,
    wabaId: c.wabaId ?? null,
    accessToken: { configured: !!c.accessTokenEnc, last4: c.accessTokenLast4 ? `••••${c.accessTokenLast4}` : null },
    appSecret: { configured: !!c.appSecretEnc, last4: c.appSecretLast4 ? `••••${c.appSecretLast4}` : null },
    verifyToken: c.verifyToken ?? null,
    webhookUrl: webhookUrlFor(row.id),
    httpsReady,
    publicUrl,
    displayPhoneNumber: c.displayPhoneNumber ?? null,
    verifiedName: c.verifiedName ?? null,
    qualityRating: c.qualityRating ?? null,
    messagingLimitTier: c.messagingLimitTier ?? null,
    lastTestedAt: c.lastTestedAt ?? null,
    lastTestOk: c.lastTestOk ?? null,
    lastError: c.lastError ?? null,
  };
}

/**
 * Sessão como o painel pode ver: sem cloudConfig (mesmo cifrado) nem credenciais do Baileys;
 * para CLOUD_API, um resumo `cloud` (configurado ✓ e últimos 4 caracteres).
 */
export function toPublicSession<T extends Record<string, any>>(session: T) {
  const rest: Record<string, any> = { ...session };
  delete rest.cloudConfig;
  delete rest.credentials;
  return rest.provider === 'CLOUD_API' ? { ...rest, cloud: cloudPublicInfo(session as any) } : rest;
}

// ─── Cadastro / edição / teste ──────────────────────────────────────────────

const digits = (label: string) =>
  z.string().trim().regex(/^\d{5,30}$/, `${label} deve conter só números (copie do painel da Meta)`);

const createSchema = z.object({
  phoneNumberId: digits('Phone Number ID'),
  wabaId: digits('WABA ID (ID da conta do WhatsApp Business)'),
  accessToken: z.string().trim().min(20, 'Token de acesso inválido').max(1024),
  appSecret: z.string().trim().regex(/^[A-Za-z0-9]{16,128}$/, 'App Secret inválido (copie em Configurações do app › Básico)'),
  agentId: z.string().uuid('Agente inválido').nullable().optional(),
});

const updateSchema = z.object({
  phoneNumberId: digits('Phone Number ID').optional(),
  wabaId: digits('WABA ID').optional(),
  // Vazio = manter o atual (o painel nunca recebe o valor salvo)
  accessToken: z.string().trim().max(1024).optional(),
  appSecret: z.string().trim().max(128).optional(),
});

function newVerifyToken() {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Phone Number ID livre? Uma sessão DESCONECTADA que nunca passou no teste (cadastro abandonado ou
 * de quem não tem o token certo) não segura o número: o ID dela é liberado.
 */
async function assertPhoneNumberIdFree(phoneNumberId: string, exceptId?: string) {
  const other = await prisma.whatsAppSession.findFirst({
    where: { cloudPhoneNumberId: phoneNumberId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, sessionId: true, status: true, lastConnectedAt: true, cloudConfig: true },
  });
  if (!other) return;
  const everWorked = !!other.lastConnectedAt || (other.cloudConfig as CloudConfigStored | null)?.lastTestOk === true;
  if (other.status === 'DISCONNECTED' && !everWorked) {
    await prisma.whatsAppSession.update({ where: { id: other.id }, data: { cloudPhoneNumberId: null } });
    invalidateProviderCache(other.sessionId);
    return;
  }
  throw new ConflictError('Este número da Meta (Phone Number ID) já está cadastrado em outra conexão.');
}

/** Teste ANTES de gravar: credencial que não funciona na Meta não é salva (nem "segura" o número). */
async function preflight(creds: CloudCreds) {
  try {
    return await getCloudPhoneNumberInfo(creds, fetchImpl);
  } catch (err) {
    if (err instanceof CloudApiError) throw new ValidationError(`Não salvamos: ${err.userMessage}`);
    if (err instanceof CloudNetworkError) {
      throw new ValidationError('Não salvamos: não foi possível falar com a Meta agora. Tente de novo em alguns minutos.');
    }
    throw err;
  }
}

function isUniqueViolation(err: any) {
  return err?.code === 'P2002';
}

async function loadTenantCloudSession(tenantId: string, id: string) {
  const session = await prisma.whatsAppSession.findFirst({ where: { id, tenantId } });
  if (!session) throw new NotFoundError('Sessão WhatsApp', id);
  if (session.provider !== 'CLOUD_API') throw new ValidationError('Este número usa a conexão por QR Code.');
  return session;
}

/** Erro que exige ação de uma pessoa (credencial errada): o número fica desconectado. */
function isCredentialError(err: unknown) {
  return err instanceof CloudApiError && ['auth', 'permission', 'not_found'].includes(err.kind);
}

/** POST /api/whatsapp/cloud — cadastra o número oficial (limite de plano vale para os dois tipos). */
export async function createCloudSession(tenantId: string, body: unknown) {
  const parsed = createSchema.parse(body ?? {});
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Empresa', tenantId);
  if (parsed.agentId) {
    const agent = await prisma.agent.findFirst({ where: { id: parsed.agentId, tenantId }, select: { id: true } });
    if (!agent) throw new NotFoundError('Agente', parsed.agentId);
  }

  // Mesma regra do QR Code: limpa órfãs do tenant e conta as sessões ativas
  await cleanupOrphanSessions(tenantId);
  const sessionCount = await prisma.whatsAppSession.count({
    where: { tenantId, status: { in: ['CONNECTED', 'CONNECTING', 'DISCONNECTED'] } },
  });
  if (isOverLimit(sessionCount, tenant.maxWhatsapp)) {
    throw new LimitError(`Limite de números de WhatsApp atingido (${tenant.maxWhatsapp}). Mude de plano para conectar mais.`);
  }
  // Testa com a Meta ANTES de gravar; só depois confere/libera o Phone Number ID
  await preflight({ phoneNumberId: parsed.phoneNumberId, accessToken: parsed.accessToken, wabaId: parsed.wabaId });
  await assertPhoneNumberIdFree(parsed.phoneNumberId);

  const config: CloudConfigStored = {
    wabaId: parsed.wabaId,
    accessTokenEnc: encryptSecret(parsed.accessToken),
    appSecretEnc: encryptSecret(parsed.appSecret),
    accessTokenLast4: parsed.accessToken.slice(-4),
    appSecretLast4: parsed.appSecret.slice(-4),
    verifyToken: newVerifyToken(),
  };
  let session;
  try {
    session = await prisma.whatsAppSession.create({
      data: {
        tenantId,
        sessionId: `wacloud_${tenantId}_${randomUUID()}`,
        provider: 'CLOUD_API',
        phoneNumber: null,
        status: 'DISCONNECTED',
        agentId: parsed.agentId ?? null,
        cloudPhoneNumberId: parsed.phoneNumberId,
        cloudConfig: config as any,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('Este número da Meta (Phone Number ID) já está cadastrado em outra conexão.');
    throw err;
  }
  // Grava os dados do número (nome verificado, qualidade, tier) e marca como conectado
  return testCloudSession(tenantId, session.id);
}

/** PATCH /api/whatsapp/cloud/:id — troca credenciais (campos vazios mantêm o valor salvo). */
export async function updateCloudSession(tenantId: string, id: string, body: unknown) {
  const parsed = updateSchema.parse(body ?? {});
  const session = await loadTenantCloudSession(tenantId, id);
  const current = (session.cloudConfig ?? {}) as CloudConfigStored;
  const config: CloudConfigStored = { ...current };
  if (parsed.wabaId) config.wabaId = parsed.wabaId;
  if (parsed.accessToken) {
    if (parsed.accessToken.length < 20) throw new ValidationError('Token de acesso inválido');
    config.accessTokenEnc = encryptSecret(parsed.accessToken);
    config.accessTokenLast4 = parsed.accessToken.slice(-4);
  }
  if (parsed.appSecret) {
    if (!/^[A-Za-z0-9]{16,128}$/.test(parsed.appSecret)) throw new ValidationError('App Secret inválido');
    config.appSecretEnc = encryptSecret(parsed.appSecret);
    config.appSecretLast4 = parsed.appSecret.slice(-4);
  }
  const changingNumber = !!parsed.phoneNumberId && parsed.phoneNumberId !== session.cloudPhoneNumberId;
  const phoneNumberId = changingNumber ? parsed.phoneNumberId! : session.cloudPhoneNumberId;
  // Credenciais novas: testa com a Meta ANTES de gravar (falhou = nada muda)
  if (changingNumber || parsed.accessToken || parsed.wabaId) {
    const currentToken = toCloudRecord(session)?.accessToken ?? null;
    const token = parsed.accessToken || currentToken;
    if (!phoneNumberId || !token) throw new ValidationError('Informe o Phone Number ID e o token de acesso.');
    await preflight({ phoneNumberId, accessToken: token, wabaId: config.wabaId });
  }
  const data: Record<string, unknown> = { cloudConfig: config };
  if (changingNumber) {
    await assertPhoneNumberIdFree(parsed.phoneNumberId!, session.id);
    data.cloudPhoneNumberId = parsed.phoneNumberId;
    data.phoneNumber = null;
  }
  // App Secret trocado: zera o contador de assinaturas inválidas
  if (parsed.appSecret) await redis.del(badSignatureKey(session.id)).catch(() => 0);
  try {
    await prisma.whatsAppSession.update({ where: { id: session.id }, data: data as any });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('Este número da Meta (Phone Number ID) já está cadastrado em outra conexão.');
    throw err;
  }
  invalidateProviderCache(session.sessionId);
  await redis.del(templatesKey(session.sessionId)).catch(() => 0);
  return testCloudSession(tenantId, session.id);
}

/** "Testar conexão": consulta o número na Meta (nome verificado, qualidade, tier). */
export async function testCloudSession(tenantId: string, id: string) {
  const session = await loadTenantCloudSession(tenantId, id);
  const rec = toCloudRecord(session);
  const config = { ...((session.cloudConfig ?? {}) as CloudConfigStored) };
  let ok = false;
  let errorText: string | null = null;
  let status = session.status;
  try {
    if (!rec?.accessToken) throw new ValidationError('Token de acesso não configurado');
    const info = await getCloudPhoneNumberInfo(cloudCreds(rec), fetchImpl);
    ok = true;
    Object.assign(config, {
      displayPhoneNumber: info.displayPhoneNumber,
      verifiedName: info.verifiedName,
      qualityRating: info.qualityRating,
      messagingLimitTier: info.messagingLimitTier,
    });
    status = 'CONNECTED';
  } catch (err: any) {
    errorText = err instanceof CloudApiError ? err.userMessage
      : err instanceof CloudNetworkError ? 'Não foi possível falar com a Meta agora. Tente de novo em alguns minutos.'
      : err?.message || 'Erro ao testar';
    // Credencial errada: desconecta. Instabilidade da Meta/rede: mantém como está.
    if (isCredentialError(err) || err instanceof ValidationError || session.status !== 'CONNECTED') status = 'DISCONNECTED';
  }
  config.lastTestedAt = new Date().toISOString();
  config.lastTestOk = ok;
  config.lastError = errorText;

  const phone = config.displayPhoneNumber ? config.displayPhoneNumber.replace(/\D/g, '') || null : null;
  const base = {
    status,
    cloudConfig: config as any,
    ...(ok ? { lastConnectedAt: new Date(), ...(session.linkedAt ? {} : { linkedAt: new Date() }) } : {}),
  };
  try {
    await prisma.whatsAppSession.update({ where: { id: session.id }, data: { ...base, ...(phone ? { phoneNumber: phone } : {}) } });
  } catch {
    // Número já registrado em outra sessão (coluna única): grava sem o número
    await prisma.whatsAppSession.update({ where: { id: session.id }, data: base });
  }
  invalidateProviderCache(session.sessionId);
  registerCloudSessionInfo(session.sessionId, tenantId, session.id);
  emitToTenant(tenantId, 'whatsapp:status', { sessionId: session.id, status, phoneNumber: phone, provider: 'CLOUD_API' });
  if (ok && session.status !== 'CONNECTED') {
    emitWebhookEvent(tenantId, 'whatsapp.connected', { sessionId: session.id, phoneNumber: phone, provider: 'CLOUD_API' });
  }
  const updated = await prisma.whatsAppSession.findUnique({
    where: { id: session.id },
    include: { agent: { select: { id: true, name: true, isActive: true } } },
  });
  return { ok, error: errorText, session: await attachCloudStats(toPublicSession(updated ?? session)) };
}

export async function getCloudSessionDetails(tenantId: string, id: string) {
  const session = await loadTenantCloudSession(tenantId, id);
  return attachCloudStats(toPublicSession(session));
}

/** OWNER/ADMIN: acrescenta ao resumo `cloud` o contador de assinaturas inválidas (Redis, 24 h). */
export async function attachCloudStats<T extends Record<string, any>>(session: T): Promise<T> {
  if (session?.provider !== 'CLOUD_API' || !session.cloud) return session;
  return { ...session, cloud: { ...session.cloud, invalidSignatures24h: await getInvalidSignatureCount(session.id) } };
}

/**
 * Quem não é OWNER/ADMIN não vê dados de configuração da Meta (verify token, WABA, final do token):
 * o resumo `cloud` vira só { provider, status, quality }.
 */
export function limitCloudForNonAdmin<T extends Record<string, any>>(session: T): T {
  if (session?.provider !== 'CLOUD_API') return session;
  return { ...session, cloud: { provider: 'CLOUD_API', status: session.status, quality: session.cloud?.qualityRating ?? null } };
}

// ─── Modelos aprovados (cache 1 h) ──────────────────────────────────────────

const TEMPLATE_CACHE_SEC = 3600;
const templatesKey = (sessionId: string) => `wa:cloud:tpl:${sessionId}`;

export async function getApprovedTemplates(rec: CloudSessionRecord, opts: { refresh?: boolean } = {}): Promise<CloudTemplate[]> {
  if (!opts.refresh) {
    try {
      const raw = await redis.get(templatesKey(rec.sessionId));
      if (raw) return JSON.parse(raw);
    } catch { /* busca de novo */ }
  }
  const all = await listCloudTemplates(cloudCreds(rec), fetchImpl);
  const approved = all.filter((t) => t.status === 'APPROVED');
  try {
    await redis.set(templatesKey(rec.sessionId), JSON.stringify(approved), 'EX', TEMPLATE_CACHE_SEC);
  } catch { /* não crítico */ }
  return approved;
}

function asUserError(err: any): never {
  if (err instanceof CloudApiError) throw new ValidationError(err.userMessage);
  if (err instanceof CloudNetworkError) throw new ValidationError('Não foi possível falar com a Meta agora. Tente de novo em alguns minutos.');
  throw err;
}

export async function listSessionTemplates(tenantId: string, id: string, opts: { refresh?: boolean } = {}) {
  const session = await loadTenantCloudSession(tenantId, id);
  const rec = toCloudRecord(session);
  if (!rec?.accessToken) throw new ValidationError('Token de acesso não configurado');
  try {
    return await getApprovedTemplates(rec, opts);
  } catch (err) {
    return asUserError(err);
  }
}

/** Confere se o modelo existe aprovado e se a quantidade de variáveis bate. */
export async function assertTemplate(rec: CloudSessionRecord, name: string, language: string, params: string[]) {
  let templates: CloudTemplate[];
  try {
    templates = await getApprovedTemplates(rec);
  } catch (err) {
    return asUserError(err);
  }
  const tpl = templates.find((t) => t.name === name && t.language === language);
  if (!tpl) throw new ValidationError('Modelo não encontrado entre os aprovados pela Meta (atualize a lista).');
  if (!tpl.supported) throw new ValidationError('Este modelo usa cabeçalho com mídia ou botão com variável, que o sistema ainda não envia.');
  if (params.length !== tpl.variables.length) {
    throw new ValidationError(`Este modelo tem ${tpl.variables.length} variável(is); preencha todas.`);
  }
  return tpl;
}

export function renderTemplate(tpl: CloudTemplate, params: string[]) {
  let out = tpl.body;
  tpl.variables.forEach((v, i) => {
    out = out.split(new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`, 'g')).join(params[i] ?? '');
  });
  return out;
}

// ─── Mensagem de teste ──────────────────────────────────────────────────────

const testSchema = z.object({
  to: z.string().trim().transform((v) => v.replace(/\D/g, '')).refine((v) => v.length >= 10 && v.length <= 15, 'Número inválido (use DDI + DDD + número, ex.: 5511999998888)'),
  text: z.string().trim().max(1000).optional(),
});

/**
 * "Enviar mensagem de teste": texto livre se o contato falou com este número nas últimas 24 h;
 * senão o modelo hello_world (que toda conta nova da Meta já tem aprovado).
 */
export async function sendCloudTestMessage(tenantId: string, id: string, body: unknown) {
  const parsed = testSchema.parse(body ?? {});
  const session = await loadTenantCloudSession(tenantId, id);
  if (session.status !== 'CONNECTED') throw new ValidationError('Teste a conexão primeiro (o número precisa estar conectado).');
  const conversation = await prisma.conversation.findFirst({
    where: { tenantId, whatsappSessionId: session.id, contactPhone: parsed.to },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, lastCustomerMessageAt: true },
  });
  const inWindow = !!conversation && isInsideCustomerWindow(conversation.lastCustomerMessageAt);
  try {
    const sent = inWindow
      ? await sendCloudSerialized(session.sessionId, `${parsed.to}@s.whatsapp.net`, { kind: 'text', text: parsed.text || 'Mensagem de teste do AtendIA ✅' }, { conversationId: conversation!.id })
      : await sendCloudSerialized(session.sessionId, `${parsed.to}@s.whatsapp.net`, { kind: 'template', name: 'hello_world', language: 'en_US' });
    return { sent: true, mode: inWindow ? 'text' : 'template', id: sent.id ?? null };
  } catch (err) {
    return asUserError(err);
  }
}

// ─── Webhook ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET: verificação da Meta. Devolve o challenge ou null (403). */
export async function verifyWebhook(dbSessionId: string, query: Record<string, unknown>): Promise<string | null> {
  if (!UUID_RE.test(dbSessionId)) return null;
  const rec = await getCloudSessionByDbId(dbSessionId);
  if (!rec) return null;
  return verifyWebhookChallenge(query, rec.verifyToken);
}

export type WebhookPostResult = 'queued' | 'invalid_signature' | 'not_found';

/** POST: valida a assinatura e enfileira (a rota responde 200 na hora). */
export async function receiveWebhook(
  dbSessionId: string,
  rawBody: Buffer | undefined,
  signature: unknown,
  body: unknown,
): Promise<WebhookPostResult> {
  if (!UUID_RE.test(dbSessionId)) return 'not_found';
  const rec = await getCloudSessionByDbId(dbSessionId);
  if (!rec) return 'not_found';
  if (!isValidSignature(rawBody, signature, rec.appSecret)) {
    // App Secret errado = 403 silencioso para a Meta: conta (24 h) para avisar no cartão do número
    await incrWithTtl(badSignatureKey(dbSessionId), BAD_SIGNATURE_TTL_SEC).catch(() => 0);
    return 'invalid_signature';
  }
  await whatsappCloudWebhookQueue.add('event', { dbSessionId, body });
  return 'queued';
}

const BAD_SIGNATURE_TTL_SEC = 24 * 3600;
export const badSignatureKey = (dbSessionId: string) => `wa:cloud:badsig:${dbSessionId}`;

/** Quantos eventos chegaram com assinatura inválida nas últimas ~24 h (0 se nenhum). */
export async function getInvalidSignatureCount(dbSessionId: string): Promise<number> {
  try {
    const raw = await redis.get(badSignatureKey(dbSessionId));
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Mesma conta/app (mesmo App Secret) da sessão que recebeu: outro número da empresa no mesmo app. */
async function resolveTargetSession(rec: CloudSessionRecord, phoneNumberId: string | null): Promise<CloudSessionRecord | null> {
  if (!phoneNumberId || phoneNumberId === rec.phoneNumberId) return rec;
  const row = await prisma.whatsAppSession.findFirst({
    where: { tenantId: rec.tenantId, provider: 'CLOUD_API', cloudPhoneNumberId: phoneNumberId },
  });
  const other = row ? toCloudRecord(row) : null;
  // Só aceita se a assinatura validada também vale para o outro número (mesmo app da Meta)
  if (!other || !other.appSecret || other.appSecret !== rec.appSecret) return null;
  return other;
}

function cloudCtx(rec: CloudSessionRecord): SessionCtx {
  return {
    tenantId: rec.tenantId,
    dbSessionId: rec.dbSessionId,
    sessionId: rec.sessionId,
    authDir: '',
    // Sem socket: a entrada compartilhada só usava o socket para baixar mídia (downloadMedia abaixo)
    sock: null as any,
    state: { creds: {} },
    provider: 'CLOUD_API',
    downloadMedia: (msg) => saveCloudMedia(rec, msg),
  };
}

/** Baixa a mídia recebida pela Graph API e salva nos uploads do tenant (≤ 16 MB). */
export async function saveCloudMedia(rec: CloudSessionRecord, msg: any): Promise<{ filePath: string } | null> {
  const ref = msg?.cloudMedia;
  if (!ref?.id || !rec.accessToken) return null;
  const media = await downloadCloudMedia(cloudCreds(rec), ref.id, fetchImpl);
  if (!media) return null;
  const isAudio = !!msg?.message?.audioMessage;
  const kind = isAudio ? 'AUDIO' : msg?.message?.imageMessage ? 'IMAGE' : msg?.message?.videoMessage ? 'VIDEO' : 'DOCUMENT';
  const dir = tenantUploadDir(rec.tenantId, isAudio ? 'audio' : 'media');
  const fileName = `${randomUUID()}.${mediaExtension(media.mimeType || ref.mimeType, ref.fileName, kind)}`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, media.buffer);
  return { filePath };
}

/** Processa um POST do webhook (worker). */
export async function processCloudWebhookJob(data: { dbSessionId: string; body: any }) {
  const rec = await getCloudSessionByDbId(data.dbSessionId);
  if (!rec) return { skipped: 'session_not_found' };
  let messages = 0;
  let statuses = 0;
  let ignored = 0;

  await handleQualityUpdates(rec, data.body).catch(() => {});

  for (const change of extractCloudChanges(data.body)) {
    const target = await resolveTargetSession(rec, change.phoneNumberId);
    if (!target) {
      ignored += change.messages.length + change.statuses.length;
      continue;
    }
    registerCloudSessionInfo(target.sessionId, target.tenantId, target.dbSessionId);

    for (const raw of change.statuses) {
      const st = normalizeCloudStatus(raw);
      if (st) {
        await processStatus(target, st).catch((err) => console.error('[WhatsApp oficial] erro no status:', err?.message));
        statuses++;
      }
    }

    // Número desconectado (manualmente ou credencial inválida): como no QR Code, nada entra
    if (target.status !== 'CONNECTED') {
      ignored += change.messages.length;
      continue;
    }
    const ctx = cloudCtx(target);
    for (const raw of change.messages) {
      const msg = normalizeCloudMessage(raw, change.contacts);
      if (!msg) {
        ignored++;
        continue;
      }
      // MESMA entrada do QR Code (fila por número|contato + todas as proteções)
      await handleIncomingMessage(ctx, msg, Date.now(), { source: 'notify' });
      messages++;
    }
  }
  return { messages, statuses, ignored };
}

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

/** Status de entrega de uma mensagem enviada por nós. */
/** Mensagens antigas (antes da coluna waMessageId) só são procuradas em metadata nesta janela recente. */
export const LEGACY_STATUS_LOOKUP_MS = 48 * 3600_000;

/** Mensagem enviada por nós com este wamid: coluna indexada; metadata só como reserva (48 h, deste número). */
export async function findSentMessage(rec: CloudSessionRecord, waMessageId: string) {
  const select = { id: true, conversationId: true, metadata: true } as const;
  const byColumn = await prisma.message.findFirst({
    where: { waMessageId, conversation: { tenantId: rec.tenantId } },
    select,
  });
  if (byColumn) return byColumn;
  return prisma.message.findFirst({
    where: {
      waMessageId: null,
      createdAt: { gte: new Date(Date.now() - LEGACY_STATUS_LOOKUP_MS) },
      conversation: { tenantId: rec.tenantId, whatsappSessionId: rec.dbSessionId },
      metadata: { path: ['waMessageId'], equals: waMessageId },
    },
    select,
  });
}

export async function processStatus(rec: CloudSessionRecord, st: CloudStatusEvent) {
  const message = await findSentMessage(rec, st.id);
  const meta = ((message?.metadata as Record<string, any>) || {});

  if (st.status === 'failed') {
    const first = st.errors[0];
    const info = describeCloudError(first?.code ?? null);
    if (message) {
      await prisma.message.update({
        where: { id: message.id },
        data: { metadata: { ...meta, deliveryStatus: 'failed', status: 'failed', error: info.message, errorCode: first?.code ?? null } as any },
      });
      const note = await prisma.message.create({
        data: { conversationId: message.conversationId, role: 'SYSTEM', content: `A mensagem não foi entregue: ${info.message}` },
      });
      emitMessage(rec.tenantId, message.conversationId, note);
      emitToTenant(rec.tenantId, 'whatsapp:message-sent', {
        sessionId: rec.sessionId, conversationId: message.conversationId, messageId: message.id, status: 'failed', error: info.message,
      });
    }
    // Mensagem de campanha que falhou conta no kill-switch dela
    const campaignId = await redis.get(`wa:campmsg:${rec.sessionId}:${st.id}`).catch(() => null);
    if (campaignId) {
      try { await recordCampaignOutcome(campaignId, 'error'); } catch { /* não crítico */ }
    }
    // Erro de qualidade/limite da Meta: mesma rotina de restrição do QR Code
    if (first?.code != null) {
      const err = new CloudApiError(first.code, 200, first.details || first.message || '');
      if (err.restriction) await applyCloudRestriction(rec, err).catch(() => null);
    }
    return 'failed';
  }

  if (!message) return 'unknown_message';
  const current = STATUS_RANK[meta.deliveryStatus] ?? 0;
  const next = STATUS_RANK[st.status] ?? 0;
  if (next <= current) return 'unchanged';
  await prisma.message.update({
    where: { id: message.id },
    data: { metadata: { ...meta, deliveryStatus: st.status } as any },
  });
  emitToTenant(rec.tenantId, 'whatsapp:message-sent', {
    sessionId: rec.sessionId, conversationId: message.conversationId, messageId: message.id, status: st.status,
  });
  return st.status;
}

/** Aviso da Meta de mudança de qualidade/limite do número (campo phone_number_quality_update). */
async function handleQualityUpdates(rec: CloudSessionRecord, body: any) {
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'phone_number_quality_update') continue;
      const v = change.value || {};
      const display = String(v.display_phone_number || '').replace(/\D/g, '');
      const ownDisplay = String(rec.config.displayPhoneNumber || '').replace(/\D/g, '');
      if (!display || display !== ownDisplay) continue;
      const config = { ...rec.config, ...(v.current_limit ? { messagingLimitTier: String(v.current_limit) } : {}) };
      if (v.event === 'FLAGGED') config.qualityRating = 'RED';
      if (v.event === 'UNFLAGGED') config.qualityRating = 'GREEN';
      await prisma.whatsAppSession.update({ where: { id: rec.dbSessionId }, data: { cloudConfig: config as any } });
      invalidateProviderCache(rec.sessionId);
      if (v.event === 'FLAGGED' || v.event === 'DOWNGRADE') {
        const text = v.event === 'FLAGGED'
          ? 'A Meta marcou a qualidade do seu número oficial como BAIXA. Reduza os envios automáticos e campanhas até a qualidade melhorar.'
          : 'A Meta reduziu o limite diário de conversas do seu número oficial.';
        emitToTenant(rec.tenantId, 'whatsapp:alert', { sessionId: rec.dbSessionId, reason: 'QUALITY', message: text });
        void alertOwners(rec.tenantId, 'Qualidade do número oficial', text);
      }
    }
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────────

/** Boot: sessões oficiais não abrem socket; só registra para os avisos do teto de automáticas. */
export async function restoreCloudSessions() {
  const rows = await prisma.whatsAppSession.findMany({
    where: { provider: 'CLOUD_API' },
    select: { id: true, sessionId: true, tenantId: true },
  });
  for (const r of rows) registerCloudSessionInfo(r.sessionId, r.tenantId, r.id);
  return rows.length;
}

// ─── Operador: janela de 24 h e modelos ─────────────────────────────────────

async function conversationCloudContext(tenantId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    include: { agent: true },
  });
  if (!conversation) throw new NotFoundError('Conversa', conversationId);
  const route = conversation.channel === 'WHATSAPP' ? await resolveConversationRoute(tenantId, conversationId) : null;
  return { conversation, route };
}

/** Painel do operador: tipo de conexão da conversa e situação da janela de 24 h. */
export async function getConversationWindow(tenantId: string, conversationId: string) {
  const { conversation, route } = await conversationCloudContext(tenantId, conversationId);
  const official = route?.provider === 'CLOUD_API';
  return {
    provider: official ? 'CLOUD_API' : route ? 'BAILEYS' : null,
    insideWindow: official ? isInsideCustomerWindow(conversation.lastCustomerMessageAt) : true,
    lastCustomerMessageAt: conversation.lastCustomerMessageAt,
    windowEndsAt: official ? customerWindowEndsAt(conversation.lastCustomerMessageAt) : null,
    message: official && !isInsideCustomerWindow(conversation.lastCustomerMessageAt) ? OUTSIDE_WINDOW_TEXT : null,
  };
}

async function cloudRecordForRoute(tenantId: string, conversationId: string) {
  const ctx = await conversationCloudContext(tenantId, conversationId);
  if (ctx.route?.provider !== 'CLOUD_API') throw new ValidationError('Modelos só existem para números conectados pela API oficial da Meta.');
  const row = await prisma.whatsAppSession.findUnique({ where: { sessionId: ctx.route.sessionId } });
  const rec = row ? toCloudRecord(row) : null;
  if (!rec || rec.tenantId !== tenantId) throw new NotFoundError('Sessão WhatsApp', ctx.route.sessionId);
  return { ...ctx, rec };
}

export async function listConversationTemplates(tenantId: string, conversationId: string) {
  const { rec } = await cloudRecordForRoute(tenantId, conversationId);
  if (!rec.accessToken) throw new ValidationError('Token de acesso não configurado');
  try {
    return (await getApprovedTemplates(rec)).filter((t) => t.supported);
  } catch (err) {
    return asUserError(err);
  }
}

const templateSendSchema = z.object({
  name: z.string().trim().min(1).max(512),
  language: z.string().trim().min(2).max(20),
  params: z.array(z.string().trim().min(1, 'Preencha todas as variáveis do modelo').max(1024)).max(20).default([]),
});

/** Operador envia um modelo aprovado (fora da janela de 24 h). Passa pela mesma fila de saída. */
export async function sendConversationTemplate(tenantId: string, conversationId: string, userId: string, body: unknown) {
  const parsed = templateSendSchema.parse(body ?? {});
  const { conversation, route, rec } = await cloudRecordForRoute(tenantId, conversationId);
  if (conversation.status === 'RESOLVED') throw new ValidationError('Conversa encerrada: reabra o atendimento para enviar mensagens.');
  if (rec.status !== 'CONNECTED') throw new ValidationError('O número oficial (Meta) desta conversa está desconectado. Teste a conexão no menu WhatsApp.');
  const tpl = await assertTemplate(rec, parsed.name, parsed.language, parsed.params);

  const content = renderTemplate(tpl, parsed.params);
  const message = await prisma.message.create({
    data: {
      conversationId,
      role: 'ASSISTANT',
      content,
      metadata: { userId, status: 'queued', template: { name: tpl.name, language: tpl.language } },
    },
  });
  emitMessage(tenantId, conversationId, message);

  const ticket = await prisma.ticket.findUnique({ where: { conversationId } });
  if (ticket) {
    await prisma.ticket.update({ where: { id: ticket.id }, data: { lastMessage: content.substring(0, 255) } });
  }
  // Como no envio do operador: a IA sai da conversa
  if (conversation.status !== 'HUMAN_TAKEOVER') {
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'HUMAN_TAKEOVER', assignedTo: conversation.assignedTo ?? userId },
    });
    emitToTenant(tenantId, 'conversation:updated', { conversation: updated });
    if (ticket && ticket.status === 'PENDING') {
      try {
        await updateTicket(tenantId, ticket.id, { status: 'OPEN', assignedTo: ticket.assignedTo ?? userId });
      } catch { /* mantém pendente */ }
    }
  }

  await whatsappOutboundQueue.add('send', {
    sessionId: route!.sessionId,
    tenantId,
    conversationId,
    jid: route!.jid,
    content,
    messageId: message.id,
    template: {
      name: tpl.name,
      language: tpl.language,
      bodyParams: parsed.params,
      paramNames: tpl.named ? tpl.variables : null,
    },
  }, { jobId: `out-${message.id}` });
  return message;
}
