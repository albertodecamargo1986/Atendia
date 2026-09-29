import 'dotenv/config';
import './lib/zod-pt.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import { Server } from 'socket.io';
import http from 'http';
import fs from 'fs';
import { globalErrorHandler } from './middlewares/error-handler.js';
import { requestIdMiddleware } from './middlewares/request-id.js';
import { authMiddleware, requireRole } from './middlewares/auth.js';
import { onlineHeartbeat } from './middlewares/online-heartbeat.js';
import { publicLimiter } from './middlewares/rate-limiter.js';
import { getConfig, getUploadRoot, getWhatsAppAuthDir, getTrustProxySetting } from './config/index.js';
import { uploadsAccessMiddleware } from './lib/uploads.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Resolve o duplo "default" da interoperabilidade ESM/CJS
function resolveDefault(mod: any): any {
  if (!mod) return mod;
  if (mod.default && typeof mod.default === 'object' && mod.default.default !== undefined) return mod.default.default;
  if (mod.default !== undefined) return mod.default;
  return mod;
}

process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Exceção não tratada — encerrando');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ err: String(reason) }, 'Promise rejeitada sem tratamento');
});

async function load<T = any>(label: string, loader: () => Promise<T>): Promise<T | undefined> {
  try {
    const mod = await loader();
    logger.info(`${label} carregado`);
    return mod;
  } catch (e: any) {
    logger.error({ err: e.message }, `Falha ao carregar ${label}`);
    return undefined;
  }
}

async function bootstrap() {
  const config = getConfig();

  // Garante as pastas de dados (produção: /app/data/uploads e /app/data/whatsapp-auth)
  fs.mkdirSync(getUploadRoot(), { recursive: true });
  fs.mkdirSync(getWhatsAppAuthDir(), { recursive: true });

  // Rotas de API — TODAS montadas sob /api (contrato Fases 1–5)
  const apiRoutes: Array<[string, string, (() => Promise<any>)]> = [
    ['/auth', 'rotas de autenticação', () => import('./routes/auth.js')],
    ['/public', 'rotas públicas', () => import('./routes/public.js')],
    ['/agents', 'rotas de agentes', () => import('./routes/agents.js')],
    ['/conversations', 'rotas de conversas', () => import('./routes/conversations.js')],
    ['/knowledge', 'rotas de conhecimento', () => import('./routes/knowledge.js')],
    ['/whatsapp', 'rotas de WhatsApp', () => import('./routes/whatsapp.js')],
    ['/users', 'rotas de usuários', () => import('./routes/users.js')],
    ['/business-hours', 'rotas de horário', () => import('./routes/business-hours.js')],
    ['/2fa', 'rotas de 2FA', () => import('./routes/two-factor.js')],
    ['/settings/api-keys', 'rotas de chaves de IA', () => import('./routes/api-keys.js')],
    ['/tickets', 'rotas de atendimentos', () => import('./routes/tickets.js')],
    ['/queues', 'rotas de filas', () => import('./routes/queues.js')],
    ['/contacts', 'rotas de contatos', () => import('./routes/contacts.js')],
    ['/quick-replies', 'rotas de respostas rápidas', () => import('./routes/quick-replies.js')],
    ['/tags', 'rotas de etiquetas', () => import('./routes/tags.js')],
    ['/media', 'rotas de mídia', () => import('./routes/media.js')],
    ['/ratings', 'rotas de avaliações', () => import('./routes/ratings.js')],
    ['/internal-chat', 'rotas de chat interno', () => import('./routes/internal-chat.js')],
    ['/campaigns', 'rotas de campanhas', () => import('./routes/campaigns.js')],
    ['/webhooks', 'rotas de webhooks', () => import('./routes/webhooks.js')],
    ['/reports', 'rotas de relatórios', () => import('./routes/reports.js')],
    ['/voice-profiles', 'rotas de perfis de voz', () => import('./routes/voice-profiles.js')],
    ['/onboarding', 'rotas de onboarding', () => import('./routes/onboarding.js')],
  ];

  const paymentsMod = await load('rotas de pagamento', () => import('./routes/payments.js'));
  const adminMod = await load('rotas de admin', () => import('./routes/admin.js'));
  const socketMod = await load('socket', () => import('./lib/socket.js'));
  const workersMod = await load('workers', () => import('./workers/index.js'));
  const autoCloseMod = await load('worker de atendimentos parados', () => import('./workers/ticket-auto-close.worker.js'));
  const bullBoardMod = await load('Bull Board', () => import('./workers/bull-board.js'));
  const whatsappMod = await load('serviço de WhatsApp', () => import('./services/whatsapp.service.js'));

  const prisma: any = resolveDefault(await import('./lib/prisma.js'));
  const redis: any = resolveDefault(await import('./lib/redis.js'));

  const app = express();
  const PORT = config.PORT;

  const trustProxy = getTrustProxySetting();
  if (trustProxy !== undefined) {
    // Atrás do Caddy/nginx: IP real do cliente para rate limit e logs
    app.set('trust proxy', trustProxy);
  }

  const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(requestIdMiddleware);
  app.use(express.json({
    limit: '2mb',
    // Guarda o corpo bruto para validar assinatura do webhook Stripe
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
  }));

  try {
    const cookieParser = (await import('cookie-parser')).default;
    app.use(cookieParser());
  } catch {
    logger.warn('cookie-parser indisponível — autenticação por cookie desativada');
  }

  // Mídias: /uploads/<tenantId>/... — só para usuários do mesmo tenant (cookie ou Bearer)
  app.use(
    '/uploads',
    uploadsAccessMiddleware,
    express.static(getUploadRoot(), { dotfiles: 'deny', index: false, fallthrough: false }),
  );

  // Liveness
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Readiness
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

  const api = express.Router();

  // Heartbeat de presença: só age depois que o auth de cada router preencheu req.user
  api.use(onlineHeartbeat);

  // Bull Board — somente SUPER_ADMIN (antes do router /admin)
  if (bullBoardMod?.setupBullBoard) {
    app.use('/api/admin/queues', authMiddleware, requireRole('SUPER_ADMIN'));
    bullBoardMod.setupBullBoard(app);
  }

  for (const [prefix, label, loader] of apiRoutes) {
    const mod = await load(label, loader);
    const router = resolveDefault(mod);
    if (router) api.use(prefix, router);
  }
  if (paymentsMod?.paymentsRouter) api.use('/payments', publicLimiter, paymentsMod.paymentsRouter);
  const adminRouter = resolveDefault(adminMod);
  if (adminRouter) api.use('/admin', adminRouter);

  app.use('/api', api);

  // 404 para rotas desconhecidas
  app.use((req: Request, res: Response, _next: NextFunction) => {
    if (!res.headersSent) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Rota não encontrada' },
        requestId: req.id || 'unknown',
      });
    }
  });

  app.use(globalErrorHandler);

  const server = http.createServer(app);

  if (socketMod?.initSocket) {
    const io = new Server(server, {
      path: '/socket.io',
      cors: { origin: allowedOrigins, credentials: true },
    });
    socketMod.initSocket(io);
  }

  workersMod?.startAIResponseWorker?.();
  workersMod?.startWhatsAppOutboundWorker?.();
  workersMod?.startOffHoursMessageWorker?.();
  workersMod?.startCampaignWorker?.();
  workersMod?.startSubscriptionCheckWorker?.();
  autoCloseMod?.startTicketAutoCloseWorker?.();

  logger.info('Workers BullMQ iniciados');

  server.listen(PORT, async () => {
    logger.info(`AtendIA backend na porta ${PORT} (API em /api)`);

    if (whatsappMod?.cleanupOrphanSessions) {
      try {
        const cleaned = await whatsappMod.cleanupOrphanSessions();
        if (cleaned > 0) logger.info(`${cleaned} sessões de WhatsApp órfãs removidas`);
      } catch (err: any) {
        logger.warn(`Limpeza de sessões de WhatsApp falhou: ${err.message}`);
      }
    }

    if (whatsappMod?.reconnectAllSessions) {
      try {
        const count = await whatsappMod.reconnectAllSessions();
        if (count > 0) logger.info(`${count} sessões de WhatsApp reconectadas`);
      } catch (err: any) {
        logger.warn(`Reconexão do WhatsApp falhou: ${err.message}`);
      }
    }
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} recebido — encerrando`);
    server.close(() => logger.info('Servidor HTTP fechado'));
    setTimeout(() => {
      logger.warn('Forçando saída após 30s');
      process.exit(1);
    }, 30_000).unref();
    try { await prisma.$disconnect(); } catch { /* ignora */ }
    try { redis.disconnect(); } catch { /* ignora */ }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
