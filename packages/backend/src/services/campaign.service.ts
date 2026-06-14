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

export async function createCampaign(tenantId: string, name: string, message: string, contactIds: string[], scheduledAt?: Date) {
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

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  const queue = await getCampaignQueue();
  const jobs = campaign.recipients
    .filter(r => r.status === 'PENDING')
    .map(recipient => ({
      name: 'send-campaign-message',
      data: {
        campaignId,
        tenantId,
        recipientId: recipient.id,
        contactId: recipient.contactId,
        contactPhone: recipient.contact.phone,
        message: campaign.message,
      },
      opts: { delay: Math.random() * 5000 } as JobsOptions,
    }));

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
