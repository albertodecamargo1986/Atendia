import { z } from 'zod';
import path from 'path';

/** Converte "true"/"false"/"1"/"0"/"yes"/"no" corretamente (z.coerce.boolean('false') seria true). */
const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === '') return undefined;
    if (typeof v === 'boolean') return v;
    return ['true', '1', 'yes', 'sim', 'on'].includes(v.trim().toLowerCase());
  });

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT — sem valores padrão
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter ao menos 16 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET deve ter ao menos 16 caracteres'),

  // Criptografia (64 caracteres hex recomendados)
  SESSION_ENCRYPTION_KEY: z.string().min(32, 'SESSION_ENCRYPTION_KEY deve ter ao menos 32 caracteres'),

  // URLs — PUBLIC_URL é a fonte; as demais são derivadas dela quando ausentes
  PUBLIC_URL: optionalString,
  FRONTEND_URL: optionalString,
  API_URL: optionalString,
  ALLOWED_ORIGINS: optionalString,
  COOKIE_SECURE: booleanFromEnv,
  TRUST_PROXY: optionalString,

  // Provedores de IA
  OPENAI_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  ELEVENLABS_API_KEY: optionalString,

  // WhatsApp
  WHATSAPP_AUTH_DIR: z.string().default('./whatsapp-auth'),

  // Pagamentos
  MP_ACCESS_TOKEN: optionalString,
  MP_WEBHOOK_SECRET: optionalString,
  MP_SANDBOX: booleanFromEnv,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,

  // Upload
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.coerce.number().default(10485760),

  // E-mail / SMTP
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: booleanFromEnv,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  EMAIL_FROM: z.string().default('AtendIA <noreply@atend-ia.com>'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

type RawConfig = z.infer<typeof configSchema>;

export type Config = Omit<RawConfig, 'FRONTEND_URL' | 'API_URL' | 'ALLOWED_ORIGINS' | 'COOKIE_SECURE' | 'SMTP_SECURE' | 'MP_SANDBOX'> & {
  FRONTEND_URL: string;
  API_URL: string;
  ALLOWED_ORIGINS: string;
  COOKIE_SECURE: boolean;
  SMTP_SECURE: boolean;
  MP_SANDBOX: boolean;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Deriva URLs e flags a partir de PUBLIC_URL (contrato Fases 1–5). */
export function deriveUrls(env: {
  PUBLIC_URL?: string;
  FRONTEND_URL?: string;
  API_URL?: string;
  ALLOWED_ORIGINS?: string;
  COOKIE_SECURE?: boolean;
}) {
  const publicUrl = env.PUBLIC_URL ? stripTrailingSlash(env.PUBLIC_URL) : undefined;
  const frontendUrl = env.FRONTEND_URL || publicUrl || 'http://localhost:5173';
  const apiUrl = env.API_URL || (publicUrl ? `${publicUrl}/api` : 'http://localhost:3001/api');
  const allowedOrigins = env.ALLOWED_ORIGINS || publicUrl || frontendUrl;
  const cookieSecure = env.COOKIE_SECURE ?? (publicUrl ? publicUrl.startsWith('https') : false);
  return {
    FRONTEND_URL: stripTrailingSlash(frontendUrl),
    API_URL: stripTrailingSlash(apiUrl),
    ALLOWED_ORIGINS: allowedOrigins,
    COOKIE_SECURE: cookieSecure,
  };
}

function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`\nFalha na validação da configuração:\n${errors}\n\nDefina as variáveis obrigatórias no arquivo .env.\n`);
    process.exit(1);
  }

  const data = result.data;

  // Detecta segredos inseguros
  const insecureSecrets: string[] = [];
  const insecurePatterns = [/mude-em-producao/i, /abc123/i, /123456/i, /password/i, /changeme/i];
  const secretFields: Record<string, string> = {
    JWT_SECRET: data.JWT_SECRET,
    JWT_REFRESH_SECRET: data.JWT_REFRESH_SECRET,
    SESSION_ENCRYPTION_KEY: data.SESSION_ENCRYPTION_KEY,
  };
  for (const [key, value] of Object.entries(secretFields)) {
    if (insecurePatterns.some((p) => p.test(value))) insecureSecrets.push(key);
  }

  if (insecureSecrets.length > 0) {
    if (data.NODE_ENV === 'production') {
      console.error(`\nERRO DE SEGURANÇA: segredos inseguros em produção:\n${insecureSecrets.map((s) => ` - ${s}`).join('\n')}\n\nGere novos com: openssl rand -hex 32\n`);
      process.exit(1);
    } else {
      console.error(`\nAVISO DE SEGURANÇA: segredos inseguros detectados (${insecureSecrets.join(', ')}). Troque antes de ir para produção.\n`);
    }
  }

  const derived = deriveUrls(data);

  return {
    ...data,
    ...derived,
    SMTP_SECURE: data.SMTP_SECURE ?? false,
    MP_SANDBOX: data.MP_SANDBOX ?? false,
  };
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

// ─── Caminhos (sem validar o resto da config — seguros para testes) ──────────

/** Diretório raiz de uploads (absoluto). Respeita UPLOAD_DIR. */
export function getUploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR || './uploads');
}

/** Diretório de sessões do WhatsApp (absoluto). Respeita WHATSAPP_AUTH_DIR. */
export function getWhatsAppAuthDir(): string {
  return path.resolve(process.env.WHATSAPP_AUTH_DIR || './whatsapp-auth');
}

/** URLs públicas derivadas de PUBLIC_URL, lidas do ambiente sem validar o resto. */
export function getPublicUrls() {
  const rawCookie = process.env.COOKIE_SECURE?.trim().toLowerCase();
  return deriveUrls({
    PUBLIC_URL: process.env.PUBLIC_URL?.trim() || undefined,
    FRONTEND_URL: process.env.FRONTEND_URL?.trim() || undefined,
    API_URL: process.env.API_URL?.trim() || undefined,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.trim() || undefined,
    COOKIE_SECURE: rawCookie ? ['true', '1', 'yes', 'sim', 'on'].includes(rawCookie) : undefined,
  });
}

/** Valor para app.set('trust proxy'), ou undefined para não configurar. */
export function getTrustProxySetting(): number | boolean | string | undefined {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  if (raw === 'true') return true;
  if (raw === 'false') return undefined;
  return raw;
}

if (process.env.NODE_ENV === 'production') {
  getConfig();
}
