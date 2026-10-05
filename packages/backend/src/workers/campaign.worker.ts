import { Worker, Job } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { getActiveSocket, sendCampaignText, sendCloudCampaignTemplate } from '../services/whatsapp.service.js';
import {
  cloudCampaignGapMs,
  parseTemplateParams,
  renderTemplateBody,
  resolveTemplateParams,
  tierDailyQuota,
} from '../lib/wa-cloud-campaign.js';
import {
  markRecipientSent,
  markRecipientFailed,
  checkCampaignCompletion,
  startCampaign,
  enqueueCampaignChain,
  campaignTokenKey,
  isRecipientStillEligible,
  recordCampaignOutcome,
} from '../services/campaign.service.js';
import { campaignQueue } from './queues.js';
import { toWhatsAppJid } from '../lib/whatsapp-jid.js';
import { getRestrictedUntil, incrWithTtl } from '../lib/wa-guards.js';
import { personalizeMessage } from '../lib/spintax.js';
import {
  campaignGapMs,
  campaignBatchPauseMs,
  campaignDailyQuota,
  isWithinCampaignWindow,
  needsBatchPause,
  nextCampaignWindowStart,
  startOfZonedDay,
  sleep,
} from '../lib/wa-pacing.js';

interface CampaignTickData {
  campaignId: string;
  tenantId: string;
  token: string;
}

interface SendCampaignData {
  campaignId: string;
  tenantId: string;
}

type CampaignJobData = CampaignTickData | SendCampaignData;

function isTickJob(data: CampaignJobData): data is CampaignTickData {
  return 'token' in data;
}

/** JID usado para enviar a mensagem da campanha a um contato. */
export function campaignRecipientJid(contactPhone: string): string {
  return toWhatsAppJid(contactPhone);
}

/** Dependências injetáveis (testes). */
export interface CampaignTickDeps {
  now: () => Date;
  random: () => number;
  wait: (ms: number) => Promise<void>;
}

const defaultDeps: CampaignTickDeps = { now: () => new Date(), random: Math.random, wait: sleep };

const SESSION_RETRY_MS = 10 * 60_000;
/** Espalha o início do dia (nada de disparar exatamente às 9:00:00). */
const WINDOW_JITTER_MS = 15 * 60_000;

async function scheduleNextTick(data: CampaignTickData, delayMs: number) {
  await campaignQueue.add('campaign-tick', data, {
    jobId: `campaign-${data.campaignId}-${data.token}-${Date.now()}`,
    delay: Math.max(0, Math.round(delayMs)),
  });
}

async function tokenIsCurrent(data: CampaignTickData) {
  return (await redis.get(campaignTokenKey(data.campaignId))) === data.token;
}

/** Grava a mensagem da campanha na conversa do contato (para a IA ter contexto quando responderem). */
async function recordCampaignMessage(params: {
  tenantId: string;
  session: { id: string; sessionId: string; agentId: string | null };
  contact: { id: string; name: string; phone: string };
  text: string;
  campaignId: string;
  jid?: string;
  waMessageId?: string;
}) {
  const { tenantId, session, contact } = params;
  try {
    let conversation = await prisma.conversation.findFirst({
      where: {
        tenantId,
        contactPhone: contact.phone,
        status: { in: ['ACTIVE', 'PENDING', 'HUMAN_TAKEOVER'] },
        OR: [{ whatsappSessionId: session.id }, { whatsappSessionId: null }],
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (!conversation) {
      const agent =
        (session.agentId
          ? await prisma.agent.findFirst({ where: { id: session.agentId, tenantId, isActive: true }, select: { id: true } })
          : null) ||
        (await prisma.agent.findFirst({ where: { tenantId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } }));
      if (!agent) return;
      conversation = await prisma.conversation.create({
        data: {
          tenantId,
          agentId: agent.id,
          channel: 'WHATSAPP',
          contactName: contact.name,
          contactPhone: contact.phone,
          contactId: contact.id,
          whatsappSessionId: session.id,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
    }
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: params.text,
        // Coluna indexada: status de entrega/erro desta mensagem encontra-a sem varrer metadata
        ...(params.waMessageId ? { waMessageId: params.waMessageId } : {}),
        metadata: {
          campaignId: params.campaignId,
          sessionId: session.sessionId,
          jid: params.jid,
          waMessageId: params.waMessageId,
          status: 'sent',
        },
      },
    });
  } catch (err: any) {
    console.error('Falha ao gravar mensagem da campanha na conversa:', err?.message);
  }
}

/**
 * Um "tick" = no máximo UM envio. Ordem: janela (seg–sex 9–19h) → número conectado →
 * cota diária → espera 25–60 s → rechecagens → opt-out → onWhatsApp → envio humanizado.
 * O próximo tick é agendado a partir do FIM deste (nunca atrasos pré-calculados).
 */
export async function processCampaignTick(data: CampaignTickData, deps: CampaignTickDeps = defaultDeps) {
  const { campaignId, tenantId } = data;
  if (!(await tokenIsCurrent(data))) return { stopped: 'stale_token' };

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, tenantId },
    include: { whatsappSession: true },
  });
  if (!campaign || campaign.status !== 'RUNNING') return { stopped: 'not_running' };

  const session = campaign.whatsappSession;
  if (!session) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
    return { stopped: 'no_session' };
  }
  // 2ª restrição em 30 dias: campanhas deste número desligadas
  if (session.campaignsDisabledAt) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
    return { stopped: 'campaigns_disabled' };
  }

  // API oficial (Cloud API): só modelo aprovado, ritmo da Meta (sem pausas longas), mesmas travas
  if (session.provider === 'CLOUD_API') return processCloudCampaignTick(data, campaign, session, deps);

  let now = deps.now();
  if (!isWithinCampaignWindow(now)) {
    const next = nextCampaignWindowStart(now);
    await scheduleNextTick(data, next.getTime() - now.getTime() + deps.random() * WINDOW_JITTER_MS);
    return { rescheduled: 'window', at: next };
  }

  if (session.status !== 'CONNECTED' || !getActiveSocket(session.sessionId)) {
    await scheduleNextTick(data, SESSION_RETRY_MS);
    return { rescheduled: 'session_offline' };
  }

  // Número limitado pelo WhatsApp (463/475): campanha espera a pausa de 24 h acabar
  const restrictedUntil = await getRestrictedUntil(session.sessionId);
  if (restrictedUntil) {
    await scheduleNextTick(data, restrictedUntil.getTime() - now.getTime() + deps.random() * WINDOW_JITTER_MS);
    return { rescheduled: 'restricted', at: restrictedUntil };
  }

  // Aquecimento: número pareado há < 14 dias (mesmo número antigo, a cada novo QR) começa em 20/dia
  const quota = campaignDailyQuota(session.linkedAt ?? session.createdAt, now);
  const sentToday = await prisma.campaignContact.count({
    where: {
      status: 'SENT',
      sentAt: { gte: startOfZonedDay(now) },
      campaign: { whatsappSessionId: session.id },
    },
  });
  if (sentToday >= quota) {
    const next = nextCampaignWindowStart(now, { skipToday: true });
    await scheduleNextTick(data, next.getTime() - now.getTime() + deps.random() * WINDOW_JITTER_MS);
    return { rescheduled: 'quota', quota, at: next };
  }

  const recipient = await prisma.campaignContact.findFirst({
    where: { campaignId, status: 'PENDING' },
    orderBy: { id: 'asc' },
    include: { contact: true },
  });
  if (!recipient) {
    await checkCampaignCompletion(campaignId);
    return { completed: true };
  }

  // Ritmo: espera 25–60 s ANTES de cada envio
  await deps.wait(campaignGapMs(deps.random));

  // Rechecagens depois da espera (pode ter sido pausada/cancelada/fechado o horário)
  if (!(await tokenIsCurrent(data))) return { stopped: 'stale_token' };
  const fresh = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId }, select: { status: true } });
  if (!fresh || fresh.status !== 'RUNNING') return { stopped: 'not_running' };
  now = deps.now();
  if (!isWithinCampaignWindow(now)) {
    await scheduleNextTick(data, 0);
    return { rescheduled: 'window' };
  }

  const contact = recipient.contact;
  if (contact.optedOutAt) {
    await markRecipientFailed(recipient.id, 'Contato pediu para não receber mensagens');
    await scheduleNextTick(data, 0);
    return { skipped: 'opted_out' };
  }
  // Revalida: ainda conversou com ESTE número nos últimos 90 dias?
  if (!(await isRecipientStillEligible(tenantId, contact, session.id))) {
    await markRecipientFailed(recipient.id, 'Contato não conversou com este número nos últimos 90 dias');
    await scheduleNextTick(data, 0);
    return { skipped: 'not_eligible' };
  }

  const text = personalizeMessage(campaign.message, contact, deps.random);
  let result: Awaited<ReturnType<typeof sendCampaignText>>;
  try {
    result = await sendCampaignText(session.sessionId, contact.phone, text, `campaign-${recipient.id}`);
  } catch (err: any) {
    if (err?.restricted && err.until instanceof Date) {
      await scheduleNextTick(data, err.until.getTime() - deps.now().getTime() + deps.random() * WINDOW_JITTER_MS);
      return { rescheduled: 'restricted' };
    }
    if (err?.maybeSent) {
      // Pode ter saído: não reenviar
      await markRecipientFailed(recipient.id, `Envio incerto: ${err.message}`);
      await recordCampaignOutcome(campaignId, 'error');
    } else if (!getActiveSocket(session.sessionId)) {
      // Número caiu antes de enviar: tenta este mesmo contato mais tarde
      await scheduleNextTick(data, SESSION_RETRY_MS);
      return { rescheduled: 'session_offline' };
    } else {
      await markRecipientFailed(recipient.id, err?.message || 'Erro ao enviar mensagem');
      await recordCampaignOutcome(campaignId, 'error');
    }
    await scheduleNextTick(data, 0);
    await checkCampaignCompletion(campaignId);
    return { failed: true };
  }

  if (!result.exists) {
    await markRecipientFailed(recipient.id, 'Número sem WhatsApp');
    // Lista com números inexistentes também é sinal ruim: conta no kill-switch
    if (await recordCampaignOutcome(campaignId, 'error')) return { stopped: 'kill_switch' };
    await scheduleNextTick(data, 0);
    await checkCampaignCompletion(campaignId);
    return { skipped: 'not_on_whatsapp' };
  }

  await markRecipientSent(recipient.id);
  if (!result.skipped) {
    await recordCampaignMessage({
      tenantId, session, contact, text, campaignId, jid: result.jid, waMessageId: result.id,
    });
    // Ack de erro desta mensagem (messages.update) conta no kill-switch da campanha
    if (result.id) await redis.set(`wa:campmsg:${session.sessionId}:${result.id}`, campaignId, 'EX', 3 * 86_400);
    await recordCampaignOutcome(campaignId, 'sent');
  }

  // Pausa longa (10–20 min) a cada 25 envios
  const sentInRun = await incrWithTtl(`campaign:run:${campaignId}`, 7 * 86_400);
  const nextDelay = needsBatchPause(sentInRun) ? campaignBatchPauseMs(deps.random) : 0;

  if (!(await checkCampaignCompletion(campaignId))) {
    await scheduleNextTick(data, nextDelay);
  }
  return { sent: true, recipientId: recipient.id, nextDelay };
}

type CampaignWithSession = NonNullable<Awaited<ReturnType<typeof loadCampaign>>>;
type CampaignSession = NonNullable<CampaignWithSession['whatsappSession']>;

function loadCampaign(campaignId: string, tenantId: string) {
  return prisma.campaign.findFirst({ where: { id: campaignId, tenantId }, include: { whatsappSession: true } });
}

/**
 * Tick da campanha pela API oficial. Mantém: janela seg–sex 9–19h, número conectado, restrição,
 * opt-out, elegibilidade por número (conversou nos últimos 90 dias), kill-switch, teto combinado
 * de automáticas e o serializador por número. Troca: modelo aprovado no lugar do texto livre,
 * cota pelo tier da Meta (sem aquecimento de QR) e intervalo curto (sem pausas de 10–20 min).
 */
export async function processCloudCampaignTick(
  data: CampaignTickData,
  campaign: CampaignWithSession,
  session: CampaignSession,
  deps: CampaignTickDeps = defaultDeps,
) {
  const { campaignId, tenantId } = data;
  if (!campaign.templateName || !campaign.templateLanguage) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
    return { stopped: 'no_template' };
  }

  let now = deps.now();
  if (!isWithinCampaignWindow(now)) {
    const next = nextCampaignWindowStart(now);
    await scheduleNextTick(data, next.getTime() - now.getTime() + deps.random() * WINDOW_JITTER_MS);
    return { rescheduled: 'window', at: next };
  }

  if (session.status !== 'CONNECTED') {
    await scheduleNextTick(data, SESSION_RETRY_MS);
    return { rescheduled: 'session_offline' };
  }

  const restrictedUntil = await getRestrictedUntil(session.sessionId);
  if (restrictedUntil) {
    await scheduleNextTick(data, restrictedUntil.getTime() - now.getTime() + deps.random() * WINDOW_JITTER_MS);
    return { rescheduled: 'restricted', at: restrictedUntil };
  }

  // Cota diária = limite de contatos do número na Meta (tier)
  const tier = (session.cloudConfig as { messagingLimitTier?: string } | null)?.messagingLimitTier;
  const quota = tierDailyQuota(tier);
  const sentToday = await prisma.campaignContact.count({
    where: { status: 'SENT', sentAt: { gte: startOfZonedDay(now) }, campaign: { whatsappSessionId: session.id } },
  });
  if (sentToday >= quota) {
    const next = nextCampaignWindowStart(now, { skipToday: true });
    await scheduleNextTick(data, next.getTime() - now.getTime() + deps.random() * WINDOW_JITTER_MS);
    return { rescheduled: 'quota', quota, at: next };
  }

  const recipient = await prisma.campaignContact.findFirst({
    where: { campaignId, status: 'PENDING' },
    orderBy: { id: 'asc' },
    include: { contact: true },
  });
  if (!recipient) {
    await checkCampaignCompletion(campaignId);
    return { completed: true };
  }

  await deps.wait(cloudCampaignGapMs(deps.random));

  if (!(await tokenIsCurrent(data))) return { stopped: 'stale_token' };
  const fresh = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId }, select: { status: true } });
  if (!fresh || fresh.status !== 'RUNNING') return { stopped: 'not_running' };
  now = deps.now();
  if (!isWithinCampaignWindow(now)) {
    await scheduleNextTick(data, 0);
    return { rescheduled: 'window' };
  }

  const contact = recipient.contact;
  if (contact.optedOutAt) {
    await markRecipientFailed(recipient.id, 'Contato pediu para não receber mensagens');
    await scheduleNextTick(data, 0);
    return { skipped: 'opted_out' };
  }
  if (!(await isRecipientStillEligible(tenantId, contact, session.id, { strictSession: true }))) {
    await markRecipientFailed(recipient.id, 'Contato não conversou com este número nos últimos 90 dias');
    await scheduleNextTick(data, 0);
    return { skipped: 'not_eligible' };
  }

  const mapping = parseTemplateParams(campaign.templateParams);
  const { values, names } = resolveTemplateParams(mapping, contact, deps.random);
  let result: Awaited<ReturnType<typeof sendCloudCampaignTemplate>>;
  try {
    result = await sendCloudCampaignTemplate(
      session.sessionId,
      contact.phone,
      { name: campaign.templateName, language: campaign.templateLanguage, bodyParams: values, paramNames: names },
      `campaign-${recipient.id}`,
    );
  } catch (err: any) {
    if (err?.restricted && err.until instanceof Date) {
      await scheduleNextTick(data, err.until.getTime() - deps.now().getTime() + deps.random() * WINDOW_JITTER_MS);
      return { rescheduled: 'restricted' };
    }
    if (err?.cloudApi || err?.maybeSent) {
      // Recusado pela Meta (não saiu) ou envio incerto: não reenviar; conta no kill-switch
      await markRecipientFailed(recipient.id, err?.userMessage || `Envio incerto: ${err?.message}`);
      if (await recordCampaignOutcome(campaignId, 'error')) return { stopped: 'kill_switch' };
    } else {
      // Erro antes de chamar a Meta (número desconectado, banco): tenta este contato mais tarde
      await scheduleNextTick(data, SESSION_RETRY_MS);
      return { rescheduled: 'session_offline' };
    }
    await scheduleNextTick(data, 0);
    await checkCampaignCompletion(campaignId);
    return { failed: true };
  }

  if (!result.exists) {
    await markRecipientFailed(recipient.id, 'Contato sem número de telefone válido');
    if (await recordCampaignOutcome(campaignId, 'error')) return { stopped: 'kill_switch' };
    await scheduleNextTick(data, 0);
    await checkCampaignCompletion(campaignId);
    return { skipped: 'invalid_number' };
  }

  await markRecipientSent(recipient.id);
  if (!result.skipped) {
    await recordCampaignMessage({
      tenantId, session, contact, text: renderTemplateBody(campaign.message, mapping, values), campaignId,
      jid: result.jid, waMessageId: result.id,
    });
    // Status "failed" desta mensagem no webhook conta no kill-switch da campanha
    if (result.id) await redis.set(`wa:campmsg:${session.sessionId}:${result.id}`, campaignId, 'EX', 3 * 86_400);
    await recordCampaignOutcome(campaignId, 'sent');
  }

  if (!(await checkCampaignCompletion(campaignId))) {
    await scheduleNextTick(data, 0);
  }
  return { sent: true, recipientId: recipient.id, nextDelay: 0 };
}

/**
 * No boot, cada campanha em envio ganha UMA corrente nova (token novo invalida ticks antigos):
 * reinício do servidor nunca gera rajada nem duas correntes para a mesma campanha.
 */
async function resumeRunningCampaigns() {
  try {
    const running = await prisma.campaign.findMany({ where: { status: 'RUNNING' }, select: { id: true, tenantId: true } });
    for (const c of running) {
      await enqueueCampaignChain(c.id, c.tenantId, campaignGapMs());
    }
  } catch (err: any) {
    console.error('Falha ao retomar campanhas em envio:', err?.message);
  }
}

export function startCampaignWorker() {
  const worker = new Worker<CampaignJobData>(
    'campaign',
    async (job: Job<CampaignJobData>) => {
      if (isTickJob(job.data)) {
        const tick = job.data;
        try {
          return await processCampaignTick(tick);
        } catch (err: any) {
          // Erro inesperado (banco/Redis): não quebra a corrente — tenta de novo em 10 min
          console.error(`Erro no envio da campanha ${tick.campaignId}:`, err?.message);
          if (await tokenIsCurrent(tick).catch(() => false)) await scheduleNextTick(tick, SESSION_RETRY_MS);
          return { error: err?.message };
        }
      }

      // Job agendado ('send-campaign'): chegou a hora — inicia a campanha de fato
      const { campaignId, tenantId } = job.data;
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, tenantId },
        select: { status: true },
      });
      if (!campaign || campaign.status !== 'SCHEDULED') {
        return { skipped: true, reason: campaign ? `status ${campaign.status}` : 'not_found' };
      }
      await startCampaign(campaignId, tenantId);
      return { started: true };
    },
    {
      connection: redis as any,
      // Campanhas de números diferentes em paralelo; cada campanha tem uma única corrente de ticks
      concurrency: 5,
      // O tick espera 25–60 s antes do envio
      lockDuration: 180_000,
    }
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    console.error(`Falha no job de campanha (campanha ${job.data.campaignId}):`, err.message);
  });

  worker.on('error', (err) => {
    console.error('Erro no worker de campanhas:', err.message);
  });

  void resumeRunningCampaigns();

  return worker;
}
