import { Worker, Job } from 'bullmq';

import redis from '../lib/redis.js';
import { processCloudWebhookJob } from '../services/whatsapp-cloud.service.js';

interface CloudWebhookJobData {
  /** id (do banco) da sessão cuja URL de webhook recebeu o evento */
  dbSessionId: string;
  body: unknown;
}

/**
 * Eventos do webhook da API oficial (Cloud API): mensagens recebidas entram pela mesma
 * entrada do QR Code (fila por número|contato); status de entrega atualizam as mensagens.
 */
export function startWhatsAppCloudWebhookWorker() {
  const worker = new Worker<CloudWebhookJobData>(
    'whatsapp-cloud-webhook',
    (job: Job<CloudWebhookJobData>) => processCloudWebhookJob(job.data as { dbSessionId: string; body: any }),
    {
      connection: redis as any,
      // A ordem por contato é garantida pela fila de entrada (por número|contato)
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    console.error(`Webhook da API oficial falhou (sessão ${job.data.dbSessionId}):`, err.message);
  });
  worker.on('error', (err) => {
    console.error('WhatsApp Cloud Webhook Worker error:', err.message);
  });
  return worker;
}
