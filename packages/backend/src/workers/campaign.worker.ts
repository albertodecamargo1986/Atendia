import { Worker, Job } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { sendWhatsAppMessage } from '../services/whatsapp.service.js';
import { markRecipientSent, markRecipientFailed, checkCampaignCompletion, startCampaign } from '../services/campaign.service.js';
import { toWhatsAppJid } from '../lib/whatsapp-jid.js';

interface SendCampaignMessageData {
  campaignId: string;
  tenantId: string;
  recipientId: string;
  contactId: string;
  contactPhone: string;
  message: string;
}

interface SendCampaignData {
  campaignId: string;
  tenantId: string;
}

type CampaignJobData = SendCampaignMessageData | SendCampaignData;

function isRecipientJob(data: CampaignJobData): data is SendCampaignMessageData {
  return 'recipientId' in data;
}

/** JID usado para enviar a mensagem da campanha a um contato. */
export function campaignRecipientJid(contactPhone: string): string {
  return toWhatsAppJid(contactPhone);
}

export function startCampaignWorker() {
  const worker = new Worker<CampaignJobData>(
    'campaign',
    async (job: Job<CampaignJobData>) => {
      // Job agendado ('send-campaign'): chegou a hora — inicia a campanha de fato
      if (!isRecipientJob(job.data)) {
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
      }

      // Envio individual ('send-campaign-message')
      const { campaignId, tenantId, recipientId, contactPhone, message } = job.data;

      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, tenantId },
        select: { status: true },
      });
      if (!campaign || campaign.status === 'CANCELLED') {
        return { skipped: true, reason: 'cancelled' };
      }

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId, status: 'CONNECTED' },
      });

      if (!session) {
        await markRecipientFailed(recipientId, 'Nenhum WhatsApp conectado');
        await checkCampaignCompletion(campaignId);
        return { success: false, reason: 'no_session' };
      }

      try {
        await sendWhatsAppMessage(session.sessionId, campaignRecipientJid(contactPhone), message);
        await markRecipientSent(recipientId);
      } catch (err: any) {
        await markRecipientFailed(recipientId, err.message || 'Erro ao enviar mensagem');
      }

      await checkCampaignCompletion(campaignId);
      return { success: true, recipientId };
    },
    {
      connection: redis as any,
      // Envio sequencial: o espaçamento entre mensagens vem do atraso de cada job
      concurrency: 1,
    }
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    const info = isRecipientJob(job.data)
      ? `destinatário ${job.data.recipientId}`
      : `campanha ${job.data.campaignId}`;
    console.error(`Falha no job de campanha (${info}):`, err.message);
  });

  worker.on('error', (err) => {
    console.error('Erro no worker de campanhas:', err.message);
  });

  return worker;
}
