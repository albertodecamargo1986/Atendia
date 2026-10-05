import prisma from '../lib/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors.js';
import { randomUUID } from 'crypto';
import redis from '../lib/redis.js';
import { getIO } from '../lib/socket.js';
import { OPT_OUT_KEYWORDS } from '../lib/opt-out.js';
import { campaignQueue } from '../workers/queues.js';
import {
  CAMPAIGN_RECENT_CONTACT_DAYS,
  CAMPAIGN_DAILY_QUOTA,
  CAMPAIGN_WARMUP_START,
  CAMPAIGN_WARMUP_DAYS,
  CAMPAIGN_MIN_GAP_MS,
  CAMPAIGN_MAX_GAP_MS,
  CAMPAIGN_BATCH_SIZE,
  CAMPAIGN_WINDOW_START_HOUR,
  CAMPAIGN_WINDOW_END_HOUR,
  campaignDailyQuota,
} from '../lib/wa-pacing.js';

/**
 * Regras da política conservadora de campanhas (exibidas no painel).
 * Campanha para quem não conversou com a empresa é o maior motivo de banimento.
 */
export const CAMPAIGN_RULES = {
  recentContactDays: CAMPAIGN_RECENT_CONTACT_DAYS,
  minGapSeconds: CAMPAIGN_MIN_GAP_MS / 1000,
  maxGapSeconds: CAMPAIGN_MAX_GAP_MS / 1000,
  batchSize: CAMPAIGN_BATCH_SIZE,
  batchPauseMinutes: [10, 20],
  dailyQuota: CAMPAIGN_DAILY_QUOTA,
  warmupStart: CAMPAIGN_WARMUP_START,
  warmupDays: CAMPAIGN_WARMUP_DAYS,
  window: { days: 'segunda a sexta', startHour: CAMPAIGN_WINDOW_START_HOUR, endHour: CAMPAIGN_WINDOW_END_HOUR, timeZone: 'America/Sao_Paulo' },
  optOutKeywords: [...OPT_OUT_KEYWORDS],
};

export const campaignTokenKey = (campaignId: string) => `campaign:token:${campaignId}`;

/** Contato cujo "telefone" é só o identificador LID (chegou de @lid sem senderPn): não é número real. */
export function isLidOnlyContact(contact: { phone: string; lid?: string | null }): boolean {
  if (!contact.lid) return false;
  const lidUser = contact.lid.split('@')[0].split(':')[0];
  return lidUser === contact.phone;
}

/**
 * Contatos que PODEM receber campanha DESTE número: enviaram mensagem (role USER) para ESTE
 * número (ou conversa antiga sem número gravado) nos últimos 90 dias, não pediram para sair,
 * não são grupo e têm telefone real (não só LID).
 */
export async function getEligibleContacts(tenantId: string, contactIds: string[] | undefined, whatsappSessionId: string) {
  const since = new Date(Date.now() - CAMPAIGN_RECENT_CONTACT_DAYS * 86_400_000);
  const conversations = await prisma.conversation.findMany({
    where: {
      tenantId,
      channel: 'WHATSAPP',
      OR: [{ whatsappSessionId }, { whatsappSessionId: null }],
      messages: { some: { role: 'USER', createdAt: { gte: since } } },
    },
    select: { contactId: true, contactPhone: true },
  });
  const ids = new Set(conversations.map((c) => c.contactId).filter(Boolean) as string[]);
  const phones = new Set(conversations.map((c) => c.contactPhone).filter(Boolean) as string[]);

  const contacts = await prisma.contact.findMany({
    where: {
      tenantId,
      optedOutAt: null,
      isGroup: false,
      ...(contactIds ? { id: { in: contactIds } } : {}),
    },
    select: { id: true, name: true, phone: true, lid: true },
    orderBy: { name: 'asc' },
  });
  return contacts
    .filter((c) => (ids.has(c.id) || phones.has(c.phone)) && !isLidOnlyContact(c))
    .map(({ lid: _lid, ...c }) => c);
}

/** Revalida um destinatário na hora do envio (pode ter saído ou a conversa ter envelhecido). */
export async function isRecipientStillEligible(
  tenantId: string,
  contact: { id: string; phone: string; lid?: string | null; optedOutAt?: Date | null; isGroup?: boolean },
  whatsappSessionId: string,
) {
  if (contact.optedOutAt || contact.isGroup || isLidOnlyContact(contact)) return false;
  const since = new Date(Date.now() - CAMPAIGN_RECENT_CONTACT_DAYS * 86_400_000);
  const conv = await prisma.conversation.findFirst({
    where: {
      tenantId,
      channel: 'WHATSAPP',
      AND: [
        { OR: [{ contactId: contact.id }, { contactPhone: contact.phone }] },
        { OR: [{ whatsappSessionId }, { whatsappSessionId: null }] },
      ],
      messages: { some: { role: 'USER', createdAt: { gte: since } } },
    },
    select: { id: true },
  });
  return !!conv;
}

/** Número da campanha: o informado (do tenant) ou o primeiro conectado. Sempre obrigatório. */
export async function resolveCampaignSession(tenantId: string, whatsappSessionId: string | null | undefined) {
  if (whatsappSessionId) {
    const session = await prisma.whatsAppSession.findFirst({
      where: { id: whatsappSessionId, tenantId },
      select: { id: true, campaignsDisabledAt: true },
    });
    if (!session) throw new NotFoundError('Sessão WhatsApp', whatsappSessionId);
    return session;
  }
  const first = await prisma.whatsAppSession.findFirst({
    where: { tenantId, status: 'CONNECTED' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, campaignsDisabledAt: true },
  });
  if (!first) throw new ValidationError('Escolha o número que vai enviar a campanha (nenhum WhatsApp conectado).');
  return first;
}

/** Campanha precisa variar entre destinatários: {nome} ou spintax {a|b}. */
const NAME_TOKEN = /\{\s*(nome|primeiro_nome|first_name)\s*\}/i;
const SPIN_TOKEN = /\{[^{}]*\|[^{}]*\}/;
const URL_TOKEN = /(https?:\/\/|www\.)\S+/i;

export function validateCampaignMessage(message: string): { warnings: string[] } {
  if (!NAME_TOKEN.test(message) && !SPIN_TOKEN.test(message)) {
    throw new ValidationError(
      'A mensagem seria idêntica para todos, o que aumenta o risco de bloqueio. Use {nome} ou variações como {Olá|Oi|Bom dia}.',
    );
  }
  const warnings: string[] = [];
  if (URL_TOKEN.test(message)) {
    warnings.push('A mensagem tem link. Links em mensagens em massa aumentam o risco de denúncia/bloqueio; prefira enviar o link só quando o cliente responder.');
  }
  return { warnings };
}

export async function createCampaign(
  tenantId: string,
  name: string,
  message: string,
  contactIds: string[],
  scheduledAt?: Date,
  whatsappSessionId?: string | null,
) {
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    throw new ValidationError('Selecione ao menos um contato');
  }
  const uniqueIds = [...new Set(contactIds.map((id) => String(id)))];

  // IDOR: todos os contatos precisam pertencer ao tenant
  const owned = await prisma.contact.findMany({
    where: { id: { in: uniqueIds }, tenantId },
    select: { id: true },
  });
  if (owned.length !== uniqueIds.length) {
    throw new ValidationError('Um ou mais contatos não foram encontrados');
  }
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    throw new ValidationError('Data de agendamento inválida');
  }
  const { warnings } = validateCampaignMessage(message);
  const session = await resolveCampaignSession(tenantId, whatsappSessionId);
  if (session.campaignsDisabledAt) {
    throw new ConflictError('As campanhas deste número estão desligadas porque o WhatsApp o limitou 2 vezes em 30 dias.');
  }
  const sessionId = session.id;

  // Política conservadora: só quem conversou com ESTE número nos últimos 90 dias e não pediu para sair
  const eligible = await getEligibleContacts(tenantId, uniqueIds, sessionId);
  if (eligible.length === 0) {
    throw new ValidationError(
      `Nenhum dos contatos pode receber campanha: só quem enviou mensagem nos últimos ${CAMPAIGN_RECENT_CONTACT_DAYS} dias e não pediu para sair.`,
    );
  }
  const eligibleIds = eligible.map((c) => c.id);

  const campaign = await prisma.campaign.create({
    data: {
      tenantId,
      name,
      message,
      status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
      scheduledAt,
      whatsappSessionId: sessionId,
      totalRecipients: eligibleIds.length,
      recipients: {
        create: eligibleIds.map(contactId => ({ contactId })),
      },
    },
    include: { recipients: true },
  });

  const result = { ...campaign, excludedCount: uniqueIds.length - eligibleIds.length, warnings };
  if (!scheduledAt) return result;

  const delay = scheduledAt.getTime() - Date.now();
  if (delay <= 0) {
    await startCampaign(campaign.id, tenantId);
  } else {
    await campaignQueue.add('send-campaign', { campaignId: campaign.id, tenantId }, {
      delay,
      jobId: `campaign-schedule-${campaign.id}`,
    });
  }

  return result;
}

/**
 * Inicia (ou retoma) a campanha: uma campanha em envio por número; o worker manda UMA
 * mensagem por "tick", esperando 25–60 s antes de cada envio, dentro da janela e da cota.
 */
export async function startCampaign(campaignId: string, tenantId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, tenantId },
  });
  if (!campaign) throw new NotFoundError('Campanha', campaignId);
  if (campaign.status === 'RUNNING' || campaign.status === 'COMPLETED') throw new ConflictError('Campanha já iniciada/concluída');
  if (campaign.status === 'CANCELLED') throw new ConflictError('Campanha cancelada não pode ser iniciada');

  // Número: o escolhido na campanha ou o primeiro conectado do tenant
  let whatsappSessionId = campaign.whatsappSessionId;
  if (!whatsappSessionId) {
    const first = await prisma.whatsAppSession.findFirst({
      where: { tenantId, status: 'CONNECTED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    whatsappSessionId = first?.id ?? null;
  }
  if (!whatsappSessionId) throw new ValidationError('Nenhum WhatsApp conectado para enviar a campanha');
  const sessionRow = await prisma.whatsAppSession.findFirst({
    where: { id: whatsappSessionId, tenantId },
    select: { campaignsDisabledAt: true, restrictedUntil: true },
  });
  if (sessionRow?.campaignsDisabledAt) {
    throw new ConflictError('As campanhas deste número estão desligadas porque o WhatsApp o limitou 2 vezes em 30 dias.');
  }
  if (sessionRow?.restrictedUntil && sessionRow.restrictedUntil.getTime() > Date.now()) {
    throw new ConflictError('O WhatsApp limitou este número temporariamente; aguarde o fim da pausa para iniciar a campanha.');
  }

  // Trava: uma campanha em envio por número
  const busy = await prisma.campaign.findFirst({
    where: { tenantId, status: 'RUNNING', whatsappSessionId, id: { not: campaignId } },
    select: { name: true },
  });
  if (busy) {
    throw new ConflictError(`Já existe uma campanha em envio neste número ("${busy.name}"). Aguarde terminar ou pause-a.`);
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'RUNNING',
      whatsappSessionId,
      ...(campaign.startedAt ? {} : { startedAt: new Date() }),
    },
  });

  await enqueueCampaignChain(campaignId, tenantId, 0);
  return { started: true };
}

/** Nova "corrente" de envios: o token antigo invalida ticks pendentes de execuções anteriores. */
export async function enqueueCampaignChain(campaignId: string, tenantId: string, delayMs: number) {
  const token = randomUUID();
  await redis.set(campaignTokenKey(campaignId), token, 'EX', 30 * 86_400);
  await campaignQueue.add('campaign-tick', { campaignId, tenantId, token }, {
    jobId: `campaign-${campaignId}-${token}`,
    delay: Math.max(0, delayMs),
  });
  return token;
}

export async function listCampaigns(tenantId: string) {
  return prisma.campaign.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { recipients: true } },
      whatsappSession: { select: { id: true, phoneNumber: true, status: true } },
    },
  });
}

export async function getCampaign(campaignId: string, tenantId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, tenantId },
    include: {
      recipients: { include: { contact: { select: { id: true, name: true, phone: true } } } },
      whatsappSession: { select: { id: true, phoneNumber: true, status: true } },
    },
  });
}

/** Cancela campanha (inclusive em envio): os destinatários restantes não recebem. */
export async function cancelCampaign(campaignId: string, tenantId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!campaign) throw new NotFoundError('Campanha', campaignId);
  if (!['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED'].includes(campaign.status)) {
    throw new ValidationError('Esta campanha já terminou');
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'CANCELLED' },
  });
  await redis.del(campaignTokenKey(campaignId)).catch(() => 0);
  return updated;
}

/** Pausa campanha em envio (retoma com /start). */
export async function pauseCampaign(campaignId: string, tenantId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!campaign) throw new NotFoundError('Campanha', campaignId);
  if (campaign.status !== 'RUNNING') throw new ValidationError('Só campanhas em envio podem ser pausadas');

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'PAUSED' },
  });
  await redis.del(campaignTokenKey(campaignId)).catch(() => 0);
  return updated;
}

export async function deleteCampaign(campaignId: string, tenantId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!campaign) throw new NotFoundError('Campanha', campaignId);
  if (campaign.status === 'RUNNING') throw new ConflictError('Não é possível deletar campanha em execução');

  await redis.del(campaignTokenKey(campaignId)).catch(() => 0);
  return prisma.campaign.delete({ where: { id: campaignId } });
}

/** Cota de hoje do número (aquecimento: < 14 dias conectado começa em 20/dia). */
export async function getSessionDailyQuota(whatsappSessionId: string, now: Date = new Date()) {
  const session = await prisma.whatsAppSession.findUnique({
    where: { id: whatsappSessionId },
    select: { createdAt: true },
  });
  return campaignDailyQuota(session?.createdAt ?? null, now);
}

export async function markRecipientSent(recipientId: string) {
  const recipient = await prisma.campaignContact.findUnique({ where: { id: recipientId } });
  if (!recipient || recipient.status !== 'PENDING') return;

  await prisma.$transaction([
    prisma.campaignContact.update({
      where: { id: recipientId },
      data: { status: 'SENT', sentAt: new Date() },
    }),
    prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: { sentCount: { increment: 1 } },
    }),
  ]);
}

export async function markRecipientFailed(recipientId: string, error: string) {
  const recipient = await prisma.campaignContact.findUnique({ where: { id: recipientId } });
  if (!recipient || recipient.status !== 'PENDING') return;

  await prisma.$transaction([
    prisma.campaignContact.update({
      where: { id: recipientId },
      data: { status: 'FAILED', error },
    }),
    prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: { failedCount: { increment: 1 } },
    }),
  ]);
}

/** Conclui a campanha em envio quando não há mais destinatários pendentes. */
export async function checkCampaignCompletion(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  if (!campaign || campaign.status !== 'RUNNING') return false;
  const pending = await prisma.campaignContact.count({ where: { campaignId, status: 'PENDING' } });
  if (pending > 0) return false;
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  await redis.del(campaignTokenKey(campaignId)).catch(() => 0);
  return true;
}

// ─── Kill-switch de qualidade ───────────────────────────────────────────────

export type CampaignOutcome = 'sent' | 'error' | 'optout';
/** Janela dos últimos envios avaliada pelo kill-switch. */
export const KILL_SWITCH_WINDOW = 20;
/** > 5% de erro em 20 envios (2 ou mais) pausa a campanha. */
export const KILL_SWITCH_MAX_ERRORS = 1;
/** > 2% de opt-out em 20 envios (1 ou mais) pausa a campanha. */
export const KILL_SWITCH_MAX_OPTOUTS = 0;

/** Decide pelo histórico recente (pura). */
export function shouldKillCampaign(outcomes: CampaignOutcome[]): { kill: boolean; reason?: string } {
  const recent = outcomes.slice(-KILL_SWITCH_WINDOW);
  const errors = recent.filter((o) => o === 'error').length;
  const optouts = recent.filter((o) => o === 'optout').length;
  if (errors > KILL_SWITCH_MAX_ERRORS) return { kill: true, reason: `${errors} erros de envio nos últimos ${recent.length} envios` };
  if (optouts > KILL_SWITCH_MAX_OPTOUTS) return { kill: true, reason: `${optouts} pedido(s) para sair nos últimos ${recent.length} envios` };
  return { kill: false };
}

/**
 * Registra o resultado de um envio da campanha e pausa (retomada só manual) se a qualidade cair:
 * erros > 5% ou opt-outs > 2% numa janela de 20 envios.
 */
export async function recordCampaignOutcome(campaignId: string, outcome: CampaignOutcome) {
  const key = `campaign:outcomes:${campaignId}`;
  let outcomes: CampaignOutcome[] = [];
  try {
    const raw = await redis.get(key);
    if (raw) outcomes = JSON.parse(raw);
  } catch { /* recomeça */ }
  outcomes = [...outcomes, outcome].slice(-KILL_SWITCH_WINDOW);
  await redis.set(key, JSON.stringify(outcomes), 'EX', 30 * 86_400);

  const decision = shouldKillCampaign(outcomes);
  if (!decision.kill) return false;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true, tenantId: true, name: true } });
  if (!campaign || campaign.status !== 'RUNNING') return false;
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
  await redis.del(campaignTokenKey(campaignId)).catch(() => 0);
  await redis.del(key).catch(() => 0);
  try {
    getIO().to(`tenant:${campaign.tenantId}`).emit('campaign:paused', {
      campaignId,
      reason: decision.reason,
      message: `Campanha "${campaign.name}" pausada por segurança: ${decision.reason}. Revise a lista antes de retomar.`,
    });
  } catch { /* socket.io indisponível */ }
  console.warn(`[campanha ${campaignId}] pausada pelo kill-switch: ${decision.reason}`);
  return true;
}
