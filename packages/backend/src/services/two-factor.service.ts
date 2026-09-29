import { NotFoundError, UnauthorizedError, ValidationError } from '../lib/errors.js';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';

const TOTP_DIGITS = 6;
const TOTP_STEP = 30; // seconds

function base32Encode(buf: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buf) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    result += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  }
  return result;
}

function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of str) {
    const val = alphabet.indexOf(char.toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateHOTP(secret: Buffer, counter: number): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(counterBuf);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

export function verifyTOTP(secret: string, token: string, window: number = 1): boolean {
  const secretBuf = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / TOTP_STEP);

  for (let i = -window; i <= window; i++) {
    const candidate = generateHOTP(secretBuf, counter + i);
    const candidateBuf = Buffer.from(candidate);
    const tokenBuf = Buffer.from(token);
    if (candidateBuf.length !== tokenBuf.length) continue;
    if (crypto.timingSafeEqual(candidateBuf, tokenBuf)) {
      return true;
    }
  }
  return false;
}

export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function generateQRCodeUrl(email: string, secret: string): string {
  const issuer = 'AtendIA';
  const account = encodeURIComponent(email);
  const encodedSecret = encodeURIComponent(secret);
  return `otpauth://totp/${issuer}:${account}?secret=${encodedSecret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;
}

export async function enable2FA(userId: string, token: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorSecret) throw new ValidationError('Configure o 2FA primeiro');

  if (!verifyTOTP(user.twoFactorSecret, token)) {
    throw new UnauthorizedError('Código inválido');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId,
      action: 'ENABLE_2FA',
      entity: 'User',
      entityId: userId,
    },
  });

  return true;
}

/** Estado atual do 2FA do usuário (para a tela de configurações). */
export async function get2FAStatus(userId: string): Promise<{ enabled: boolean; configured: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, twoFactorSecret: true } });
  if (!user) throw new NotFoundError('Usuário', userId);
  return { enabled: user.twoFactorEnabled, configured: !!user.twoFactorSecret };
}

export async function disable2FA(userId: string, token: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('Usuário', userId);

  if (!user.twoFactorSecret) {
    throw new ValidationError('2FA não configurado para este usuário');
  }

  if (user.twoFactorEnabled && !verifyTOTP(user.twoFactorSecret, token)) {
    throw new UnauthorizedError('Código inválido');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId,
      action: 'DISABLE_2FA',
      entity: 'User',
      entityId: userId,
    },
  });

  return true;
}

/**
 * Gera (ou regenera) o segredo TOTP. Se o 2FA já estiver ATIVO, exige o código
 * atual — senão alguém com a sessão aberta poderia trocar o segredo e travar o dono.
 */
export async function setup2FA(userId: string, currentToken?: string): Promise<{ secret: string; qrUrl: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('Usuário', userId);

  if (user.twoFactorEnabled) {
    if (!currentToken) {
      throw new ValidationError('O 2FA já está ativo. Informe o código atual para gerar um novo QR Code.');
    }
    if (!user.twoFactorSecret || !verifyTOTP(user.twoFactorSecret, currentToken)) {
      throw new UnauthorizedError('Código inválido');
    }
  }

  const secret = generateSecret();

  // Ao regenerar, o 2FA fica desativado até o usuário confirmar o novo código em /2fa/enable
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: secret, twoFactorEnabled: false },
  });

  const qrUrl = generateQRCodeUrl(user.email, secret);

  return { secret, qrUrl };
}

export async function verify2FAToken(userId: string, token: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorSecret) return false;

  return verifyTOTP(user.twoFactorSecret, token);
}
