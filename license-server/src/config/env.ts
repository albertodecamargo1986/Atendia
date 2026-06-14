import dotenv from 'dotenv';

dotenv.config();

function envString(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${raw}`);
  }
  return parsed;
}

export const env = {
  PORT: envNumber('PORT', 3100),
  DATABASE_URL: envString('DATABASE_URL', 'postgresql://localhost:5432/atendia_licenses'),
  RSA_PRIVATE_KEY_PATH: envString('RSA_PRIVATE_KEY_PATH', './keys/private.pem'),
  RSA_PUBLIC_KEY_PATH: envString('RSA_PUBLIC_KEY_PATH', './keys/public.pem'),
  JWT_EXPIRES_IN: envString('JWT_EXPIRES_IN', '24h'),
  HEARTBEAT_INTERVAL_MS: envNumber('HEARTBEAT_INTERVAL_MS', 14400000),
  OFFLINE_TOLERANCE_DAYS: envNumber('OFFLINE_TOLERANCE_DAYS', 7),
  TRANSFER_LIMIT_PER_YEAR: envNumber('TRANSFER_LIMIT_PER_YEAR', 2),
} as const;
