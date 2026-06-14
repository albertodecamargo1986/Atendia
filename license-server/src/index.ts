import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { generalLimiter } from './middleware/rateLimiter';
import { licenseRouter } from './routes/license';
import { securityRouter } from './routes/security';

const app = express();

// ---------- Security Headers ----------
app.use(helmet());

// ---------- CORS ----------
const allowedOrigins = [
  'https://atendia.com.br',
  'https://admin.atendia.com.br',
  'https://app.atendia.com.br',
];

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (desktop app, Postman, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS origin not allowed'));
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

// ---------- Body Parser ----------
app.use(express.json({ limit: '1mb' }));

// ---------- General Rate Limiting ----------
app.use(generalLimiter);

// ---------- Health Check ----------
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// ---------- Routes ----------
app.use('/api/license', licenseRouter);
app.use('/api/security', securityRouter);

// ---------- 404 Fallback ----------
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found.',
  });
});

// ---------- Global Error Handler ----------
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.message);

  if (err.message === 'CORS origin not allowed') {
    res.status(403).json({ success: false, error: 'CORS origin not allowed.' });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error.',
  });
});

// ---------- Start Server ----------
app.listen(env.PORT, () => {
  console.log(`AtendIA License Server running on port ${env.PORT}`);
  console.log(`  CORS origins: ${allowedOrigins.join(', ')}`);
  console.log(`  Heartbeat interval: ${env.HEARTBEAT_INTERVAL_MS}ms`);
  console.log(`  Offline tolerance: ${env.OFFLINE_TOLERANCE_DAYS} days`);
  console.log(`  Transfer limit: ${env.TRANSFER_LIMIT_PER_YEAR} per year`);
});

export default app;
