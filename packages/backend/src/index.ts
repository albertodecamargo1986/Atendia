import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import { Server } from 'socket.io';
import http from 'http';
import path from 'path';
import { globalErrorHandler } from './middlewares/error-handler.js';
import { requestIdMiddleware } from './middlewares/request-id.js';
import { AppError } from './lib/errors.js';
import { authMiddleware } from './middlewares/auth.js';
import { onlineHeartbeat } from './middlewares/online-heartbeat.js';
import rateLimit from 'express-rate-limit';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Helper to resolve ESM/CJS interop double-wrapping of default exports
function resolveDefault(mod: any): any {
  if (!mod) return mod;
  // CJS compiled: { __esModule: true, default: { default: actual } }
  if (mod.default && typeof mod.default === 'object' && mod.default.default !== undefined) return mod.default.default;
  // Normal ESM: { default: actual }
  if (mod.default !== undefined) return mod.default;
  return mod;
}

// Global error handlers
process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught Exception â€” exiting');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ err: String(reason) }, 'Unhandled Rejection');
});

async function bootstrap() {
  let authRoutes: any, agentRoutes: any, conversationRoutes: any, knowledgeRoutes: any, whatsappRoutes: any, apiKeysRoutes: any;
  let licenseRouter: any, paymentsRouter: any, userRoutes: any, businessHoursRoutes: any, twoFactorRoutes: any;
  let ticketRoutes: any, queueRoutes: any, contactRoutes: any, quickReplyRoutes: any, tagRoutes: any, mediaRoutes: any;
  let ratingRoutes: any, internalChatRoutes: any, campaignRoutes: any, webhookRoutes: any, reportRoutes: any;
  let voiceProfileRoutes: any, downloadRoutes: any, adminRoutes: any;
  let initSocket: any, startAIResponseWorker: any, startWhatsAppOutboundWorker: any, startOffHoursMessageWorker: any;
  let startTicketAutoCloseWorker: any, startCampaignWorker: any;
  let setupBullBoard: any, reconnectAllSessions: any;

  try { authRoutes = resolveDefault(await import('./routes/auth.js')); logger.info('Auth routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load auth routes'); }
  try { agentRoutes = resolveDefault(await import('./routes/agents.js')); logger.info('Agent routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load agent routes'); }
  try { conversationRoutes = resolveDefault(await import('./routes/conversations.js')); logger.info('Conversation routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load conversation routes'); }
  try { knowledgeRoutes = resolveDefault(await import('./routes/knowledge.js')); logger.info('Knowledge routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load knowledge routes'); }
  try { whatsappRoutes = resolveDefault(await import('./routes/whatsapp.js')); logger.info('WhatsApp routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load whatsapp routes'); }
  try { ({ licenseRouter } = await import('./routes/license.js')); logger.info('License routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load license routes'); }
  try { ({ paymentsRouter } = await import('./routes/payments.js')); logger.info('Payment routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load payment routes'); }
  try { userRoutes = resolveDefault(await import('./routes/users.js')); logger.info('User routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load user routes'); }
  try { businessHoursRoutes = resolveDefault(await import('./routes/business-hours.js')); logger.info('Business hours routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load business-hours routes'); }
  try { twoFactorRoutes = resolveDefault(await import('./routes/two-factor.js')); logger.info('2FA routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load two-factor routes'); }
  try { apiKeysRoutes = resolveDefault(await import('./routes/api-keys.js')); logger.info('API Keys routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load api-keys routes'); }
  try { ticketRoutes = resolveDefault(await import('./routes/tickets.js')); logger.info('Ticket routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load ticket routes'); }
  try { queueRoutes = resolveDefault(await import('./routes/queues.js')); logger.info('Queue routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load queue routes'); }
  try { contactRoutes = resolveDefault(await import('./routes/contacts.js')); logger.info('Contact routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load contact routes'); }
  try { quickReplyRoutes = resolveDefault(await import('./routes/quick-replies.js')); logger.info('Quick Reply routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load quick-replies routes'); }
  try { tagRoutes = resolveDefault(await import('./routes/tags.js')); logger.info('Tag routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load tags routes'); }
  try { mediaRoutes = resolveDefault(await import('./routes/media.js')); logger.info('Media routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load media routes'); }
  try { ratingRoutes = resolveDefault(await import('./routes/ratings.js')); logger.info('Rating routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load rating routes'); }
  try { internalChatRoutes = resolveDefault(await import('./routes/internal-chat.js')); logger.info('Internal chat routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load internal-chat routes'); }
  try { campaignRoutes = resolveDefault(await import('./routes/campaigns.js')); logger.info('Campaign routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load campaign routes'); }
  try { webhookRoutes = resolveDefault(await import('./routes/webhooks.js')); logger.info('Webhook routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load webhook routes'); }
  try { reportRoutes = resolveDefault(await import('./routes/reports.js')); logger.info('Report routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load report routes'); }
  try { voiceProfileRoutes = resolveDefault(await import('./routes/voice-profiles.js')); logger.info('Voice profile routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load voice-profile routes'); }
  try { downloadRoutes = resolveDefault(await import('./routes/download.js')); logger.info('Download routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load download routes'); }
  try { adminRoutes = resolveDefault(await import('./routes/admin.js')); logger.info('Admin routes loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load admin routes'); }
  try { ({ initSocket } = await import('./lib/socket.js')); logger.info('Socket loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load socket'); }
  try { ({ startAIResponseWorker, startWhatsAppOutboundWorker, startOffHoursMessageWorker, startCampaignWorker } = await import('./workers/index.js')); logger.info('Workers loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load workers'); }
  try { ({ startTicketAutoCloseWorker } = await import('./workers/ticket-auto-close.worker.js')); logger.info('Ticket auto-close worker loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load ticket-auto-close worker'); }
  try { ({ setupBullBoard } = await import('./workers/bull-board.js')); logger.info('Bull Board loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load bull-board'); }
  try { ({ reconnectAllSessions } = await import('./services/whatsapp.service.js')); logger.info('WhatsApp service loaded'); } catch (e: any) { logger.error({ err: e.message }, 'Failed to load whatsapp service'); }

  const prisma: any = resolveDefault(await import('./lib/prisma.js'));
  const redis: any = resolveDefault(await import('./lib/redis.js'));

  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // CORS â€” explicit origins in production
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : [process.env.FRONTEND_URL || 'http://localhost:5173'];

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json());
  app.use(requestIdMiddleware);

  // Trust proxy (nginx) for accurate IP detection and rate limiting
  app.set('trust proxy', 1);

  // Cookie parser para httpOnly token support
  try {
    const cookieParser = (await import('cookie-parser')).default;
    app.use(cookieParser());
  } catch {
    logger.warn('cookie-parser not available — httpOnly cookie auth disabled');
  }

  // Rate limiting
  const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMIT', message: 'Limite de requisiÃ§Ãµes atingido. Tente novamente em alguns minutos.' } } });
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMIT', message: 'Muitas tentativas de login. Tente novamente em 15 minutos.' } } });

  // Serve uploaded media files
  app.use('/uploads', authMiddleware, express.static(path.resolve(process.env.UPLOAD_DIR || 'uploads')));

  // Liveness check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Readiness check
  app.get('/ready', async (_req, res) => {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};
    let allOk = true;

    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - start };
    } catch {
      checks.database = { status: 'error' };
      allOk = false;
    }

    try {
      const start = Date.now();
      await redis.ping();
      checks.redis = { status: 'ok', latencyMs: Date.now() - start };
    } catch {
      checks.redis = { status: 'error' };
      allOk = false;
    }

    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  // API routes
  if (authRoutes) app.use('/auth', authLimiter, authRoutes);

  // Heartbeat middleware para rotas autenticadas
  app.use(onlineHeartbeat);

  if (agentRoutes) app.use('/agents', agentRoutes);
  if (conversationRoutes) app.use('/conversations', conversationRoutes);
  if (knowledgeRoutes) app.use('/knowledge', knowledgeRoutes);
  if (whatsappRoutes) app.use('/whatsapp', whatsappRoutes);
  if (licenseRouter) app.use('/license', publicLimiter, licenseRouter);
  if (paymentsRouter) app.use('/payments', publicLimiter, paymentsRouter);
  if (userRoutes) app.use('/users', userRoutes);
  if (businessHoursRoutes) app.use('/business-hours', businessHoursRoutes);
  if (twoFactorRoutes) app.use('/2fa', twoFactorRoutes);
  if (apiKeysRoutes) app.use('/settings/api-keys', apiKeysRoutes);
  if (ticketRoutes) app.use('/tickets', ticketRoutes);
  if (queueRoutes) app.use('/queues', queueRoutes);
  if (contactRoutes) app.use('/contacts', contactRoutes);
  if (quickReplyRoutes) app.use('/quick-replies', quickReplyRoutes);
  if (tagRoutes) app.use('/tags', tagRoutes);
  if (mediaRoutes) app.use('/media', mediaRoutes);
  if (ratingRoutes) app.use('/ratings', ratingRoutes);
  if (internalChatRoutes) app.use('/internal-chat', internalChatRoutes);
  if (campaignRoutes) app.use('/campaigns', campaignRoutes);
  if (webhookRoutes) app.use('/webhooks', webhookRoutes);
  if (reportRoutes) app.use('/reports', reportRoutes);
  if (voiceProfileRoutes) app.use('/voice-profiles', voiceProfileRoutes);
  if (downloadRoutes) app.use('/download', publicLimiter, downloadRoutes);
  if (adminRoutes) app.use('/admin', adminRoutes);

  if (setupBullBoard) {
    const { requireRole: requireRoleAuth } = await import('./middlewares/auth.js');
  app.use('/admin/queues', authMiddleware, requireRoleAuth('OWNER', 'ADMIN'));
    setupBullBoard(app);
  }

  // 404 handler for unmatched routes
  app.use((_req: Request, res: Response, next: NextFunction) => {
    if (!res.headersSent) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Rota nÃ£o encontrada' },
        requestId: _req.id || 'unknown',
      });
    }
  });

  // Global error handler â€” must be after all routes
  app.use(globalErrorHandler);

  const server = http.createServer(app);

  if (initSocket) {
    const io = new Server(server, {
      cors: {
        origin: allowedOrigins,
        credentials: true,
      },
    });
    initSocket(io);
  }

  if (startAIResponseWorker) startAIResponseWorker();
  if (startWhatsAppOutboundWorker) startWhatsAppOutboundWorker();
  if (startOffHoursMessageWorker) startOffHoursMessageWorker();
  if (startTicketAutoCloseWorker) startTicketAutoCloseWorker();
	if (startCampaignWorker) startCampaignWorker();

  logger.info('BullMQ workers started');

  server.listen(PORT, async () => {
    logger.info(`AtendIA Backend running on port ${PORT}`);
    logger.info('Socket.io ready');
    logger.info(`Bull Board available at http://localhost:${PORT}/admin/queues`);

    if (reconnectAllSessions) {
      try {
        const count = await reconnectAllSessions();
        if (count > 0) logger.info(`Reconnected ${count} WhatsApp sessions`);
      } catch (err: any) {
        logger.warn(`WhatsApp reconnect failed: ${err.message}`);
      }
    }
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received â€” shutting down gracefully`);

    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Force exit after 30s
    setTimeout(() => {
      logger.warn('Forcing exit after 30s timeout');
      process.exit(1);
    }, 30_000).unref();

    try {
      await prisma.$disconnect();
      logger.info('Database disconnected');
    } catch {}

    try {
      redis.disconnect();
      logger.info('Redis disconnected');
    } catch {}

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

