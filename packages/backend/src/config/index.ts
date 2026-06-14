import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT — no fallbacks, must be set
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),

  // License
  LICENSE_JWT_SECRET: z.string().min(16, 'LICENSE_JWT_SECRET must be at least 16 characters').optional(),
  LICENSE_JWT_EXPIRES_IN: z.string().default('24h'),
  OFFLINE_TOLERANCE_DAYS: z.coerce.number().default(7),
  TRANSFER_LIMIT_PER_YEAR: z.coerce.number().default(2),

  // Encryption — no fallbacks
  SESSION_ENCRYPTION_KEY: z.string().min(32, 'SESSION_ENCRYPTION_KEY must be at least 32 characters'),

  // Frontend
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  API_URL: z.string().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  // AI providers
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  DEFAULT_AI_MODEL: z.string().default('gpt-4o-mini'),

  // WhatsApp
  WHATSAPP_AUTH_DIR: z.string().default('./whatsapp-auth'),

  // Payments
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),
  MP_SANDBOX: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),

  // Upload
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILE_SIZE: z.coerce.number().default(10485760),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

function loadConfig() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map(i => ` - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`\nConfiguration validation failed:\n${errors}\n\nSet the required environment variables in your .env file.\n`);
    process.exit(1);
  }

  const data = result.data;

  const insecureSecrets: string[] = [];
  if (data.JWT_SECRET.includes('mude-em-producao') || data.JWT_SECRET.includes('abc123')) insecureSecrets.push('JWT_SECRET');
  if (data.JWT_REFRESH_SECRET.includes('mude-em-producao') || data.JWT_REFRESH_SECRET.includes('xyz789')) insecureSecrets.push('JWT_REFRESH_SECRET');
  if (data.SESSION_ENCRYPTION_KEY.includes('chave-de-32-bytes')) insecureSecrets.push('SESSION_ENCRYPTION_KEY');

  if (insecureSecrets.length > 0) {
    if (data.NODE_ENV === 'production') {
      console.error(`\nSECURITY ERROR: Insecure default secrets in production:\n${insecureSecrets.map(s => ` - ${s}`).join('\n')}\n\nGenerate new secrets with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"\n`);
      process.exit(1);
    } else {
      console.warn(`\nSECURITY WARNING: Insecure default secrets detected (${insecureSecrets.join(', ')}). Change before production.\n`);
    }
  }

  return data;
}

let _config: z.infer<typeof configSchema> | null = null;

export function getConfig() {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

if (process.env.NODE_ENV === 'production') {
  loadConfig();
}

export type Config = z.infer<typeof configSchema>;
