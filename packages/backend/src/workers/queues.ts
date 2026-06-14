import { Queue } from 'bullmq';
import redis from '../lib/redis.js';

export const aiResponseQueue = new Queue('ai-response', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 100 },
  },
});

export const whatsappOutboundQueue = new Queue('whatsapp-outbound', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 100 },
  },
});

export const offhoursMessageQueue = new Queue('offhours-message', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 1000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 50 },
  },
});
