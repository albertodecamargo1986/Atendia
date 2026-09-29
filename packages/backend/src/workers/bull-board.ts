import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import redis from '../lib/redis.js';
import { aiResponseQueue, whatsappOutboundQueue, offhoursMessageQueue } from './queues.js';

export function setupBullBoard(app: import('express').Express) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/api/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(aiResponseQueue) as any,
      new BullMQAdapter(whatsappOutboundQueue) as any,
      new BullMQAdapter(offhoursMessageQueue) as any,
      new BullMQAdapter(new Queue('campaign', { connection: redis as any })) as any,
    ],
    serverAdapter,
  });

  app.use('/api/admin/queues', serverAdapter.getRouter());
}
