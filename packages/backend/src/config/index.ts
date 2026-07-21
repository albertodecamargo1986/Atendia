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

  // Email / SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('AtendIA <noreply@atend-ia.com>'),

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

  // Detect insecure secrets using patterns
  const insecureSecrets: string[] = [];
  const insecurePatterns = [
    /mude-em-producao/i,
    /abc123/i,
    /123456/i,
    /password/i,
    /secret/i,
    /\b\d{6,}\b/, // any numeric string >=6 digits
  ];
  const secretFields: Record<string, string> = {
    JWT_SECRET: data.JWT_SECRET,
    JWT_REFRESH_SECRET: data.JWT_REFRESH_SECRET,
    SESSION_ENCRYPTION_KEY: data.SESSION_ENCRYPTION_KEY,
  };
  for (const [key, value] of Object.entries(secretFields)) {
    if (insecurePatterns.some(p => p.test(value))) {
      insecureSecrets.push(key);
    }
  }

  if (insecureSecrets.length > 0) {
    if (data.NODE_ENV === 'production') {
      console.error(`\nSECURITY ERROR: Insecure default secrets in production:\n${insecureSecrets.map(s => ` - ${s}`).join('\n')}\n\nGenerate new secrets with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"\n`);
      process.exit(1);
    } else {
      console.error(`\nSECURITY WARNING: Insecure default secrets detected (${insecureSecrets.join(', ')}). Change before production.\n`);
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
