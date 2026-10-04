import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import {
  aiResponseQueue,
  whatsappOutboundQueue,
  offhoursMessageQueue,
  audioTranscriptionQueue,
  campaignQueue,
} from './queues.js';

export function setupBullBoard(app: import('express').Express) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/api/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(aiResponseQueue) as any,
      new BullMQAdapter(whatsappOutboundQueue) as any,
      new BullMQAdapter(offhoursMessageQueue) as any,
      new BullMQAdapter(audioTranscriptionQueue) as any,
      new BullMQAdapter(campaignQueue) as any,
    ],
    serverAdapter,
  });

  app.use('/api/admin/queues', serverAdapter.getRouter());
}
