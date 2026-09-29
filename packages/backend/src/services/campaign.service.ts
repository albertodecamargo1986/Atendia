import prisma from '../lib/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors.js';
import { Queue, JobsOptions } from 'bullmq';
import redis from '../lib/redis.js';

let campaignQueue: Queue | null = null;

async function getCampaignQueue() {
  if (!campaignQueue) {
    campaignQueue = new Queue('campaign', { connection: redis as any });
  }
  return campaignQueue;
}

/** Intervalo aleatório entre envios da campanha (3 a 8 s) para reduzir risco de bloqueio. */
export const CAMPAIGN_MIN_DELAY_MS = 3000;
export const CAMPAIGN_MAX_DELAY_MS = 8000;

export function randomCampaignDelay(random: () => number = Math.random): number {
  return CAMPAIGN_MIN_DELAY_MS + Math.floor(random() * (CAMPAIGN_MAX_DELAY_MS - CAMPAIGN_MIN_DELAY_MS + 1));
}

export async function createCampaign(tenantId: string, name: string, message: string, contactIds: string[], scheduledAt?: Date) {
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
  contactIds = uniqueIds;

  const campaign = await prisma.campaign.create({
    data: {
      tenantId,
      name,
      message,
      status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
      scheduledAt,
      totalRecipients: contactIds.length,
      recipients: {
        create: contactIds.map(contactId => ({ contactId })),
      },
    },
    include: { recipients: true },
  });

  if (!scheduledAt) return campaign;

  const queue = await getCampaignQueue();
  const delay = scheduledAt.getTime() - Date.now();
  if (delay <= 0) {
    await startCampaign(campaign.id, tenantId);
  } else {
    await queue.add('send-campaign', { campaignId: campaign.id, tenantId }, { delay } as JobsOptions);
  }

  return campaign;
}

export async function startCampaign(campaignId: string, tenantId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, tenantId },
    include: { recipients: { include: { contact: true } } },
  });
  if (!campaign) throw new NotFoundError('Campanha', campaignId);
  if (campaign.status === 'RUNNING' || campaign.status === 'COMPLETED') throw new ConflictError('Campanha já iniciada/concluída');
  if (campaign.status === 'CANCELLED') throw new ConflictError('Campanha cancelada não pode ser iniciada');

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  const queue = await getCampaignQueue();
  // Throttle: cada mensagem sai 3–8 s (aleatório) depois da anterior
  let cumulativeDelay = 0;
  const jobs = campaign.recipients
    .filter(r => r.status === 'PENDING')
    .map((recipient, index) => {
      if (index > 0) cumulativeDelay += randomCampaignDelay();
      return {
        name: 'send-campaign-message',
        data: {
          campaignId,
          tenantId,
          recipientId: recipient.id,
          contactId: recipient.contactId,
          contactPhone: recipient.contact.phone,
          message: campaign.message,
        },
        opts: { delay: cumulativeDelay, jobId: `campaign-${campaignId}-${recipient.id}` } as JobsOptions,
      };
    });

  if (jobs.length > 0) {
    await queue.addBulk(jobs);
  }

  return { started: true };
}

export async function listCampaigns(tenantId: string) {
  return prisma.campaign.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { recipients: true } } },
  });
}

export async function getCampaign(campaignId: string, tenantId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, tenantId },
    include: {
      recipients: { include: { contact: { select: { id: true, name: true, phone: true } } } },
    },
  });
}

export async function cancelCampaign(campaignId: string, tenantId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!campaign) throw new NotFoundError('Campanha', campaignId);
  if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') throw new ValidationError('Apenas campanhas rascunho/agendadas podem ser canceladas');

  return prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'CANCELLED' },
  });
}

export async function deleteCampaign(campaignId: string, tenantId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } });
  if (!campaign) throw new NotFoundError('Campanha', campaignId);
  if (campaign.status === 'RUNNING') throw new ConflictError('Não é possível deletar campanha em execução');

  return prisma.campaign.delete({ where: { id: campaignId } });
}

export async function markRecipientSent(recipientId: string) {
  const recipient = await prisma.campaignContact.findUnique({ where: { id: recipientId } });
  if (!recipient) return;

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
  if (!recipient) return;

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

export async function checkCampaignCompletion(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { totalRecipients: true, sentCount: true, failedCount: true },
  });
  if (!campaign) return;
  if (campaign.sentCount + campaign.failedCount >= campaign.totalRecipients) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }
}
