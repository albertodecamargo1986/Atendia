import { PrismaClient } from '@prisma/client';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
});

prisma.$on('query', (e) => {
  logger.debug({ query: e.query, duration: e.duration, params: e.params }, 'Prisma Query');
});

export default prisma;
