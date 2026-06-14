import { Worker, Job } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { sendWhatsAppMessage } from '../services/whatsapp.service.js';
import { markRecipientSent, markRecipientFailed, checkCampaignCompletion } from '../services/campaign.service.js';

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

export function startCampaignWorker() {
  const worker = new Worker<CampaignJobData>(
    'campaign',
    async (job: Job<CampaignJobData>) => {
      // Handle top-level 'send-campaign' job (start trigger)
      if (!isRecipientJob(job.data)) {
        const { campaignId, tenantId } = job.data;
        const campaign = await prisma.campaign.findFirst({
          where: { id: campaignId, tenantId },
        });
        if (!campaign || campaign.status !== 'RUNNING') {
          return { skipped: true };
        }
        return { started: true };
      }

      // Handle individual 'send-campaign-message' job
      const { campaignId, tenantId, recipientId, contactPhone, message } = job.data;

      const session = await prisma.whatsAppSession.findFirst({
        where: { tenantId, status: 'CONNECTED' },
      });

      if (!session) {
        await markRecipientFailed(recipientId, 'Nenhuma sessão WhatsApp conectada');
        await checkCampaignCompletion(campaignId);
        return { success: false, reason: 'no_session' };
      }

      const jid = `${contactPhone}@s.whats.net`;

      try {
        await sendWhatsAppMessage(session.sessionId, jid, message);
        await markRecipientSent(recipientId);
      } catch (err: any) {
        await markRecipientFailed(recipientId, err.message || 'Erro ao enviar mensagem');
      }

      await checkCampaignCompletion(campaignId);
      return { success: true, recipientId };
    },
    {
      connection: redis as any,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    const info = isRecipientJob(job.data)
      ? `recipient ${job.data.recipientId}`
      : `campaign ${job.data.campaignId}`;
    console.error(`Campaign job failed (${info}):`, err.message);
  });

  worker.on('error', (err) => {
    console.error('Campaign Worker error:', err.message);
  });

  return worker;
}
