import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { getConfig } from '../config/index.js';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  plan: string;
  /** Tipo do token — access tokens sempre carregam 'access' */
  type?: 'access';
}

// Audiência distinta para o token temporário do 2FA: impede que ele seja aceito
// como access token (mesmo que alguém tente reaproveitá-lo).
const TWO_FA_AUDIENCE = 'atendia:2fa';
const ACCESS_AUDIENCE = 'atendia:access';

export function signAccessToken(payload: JwtPayload): string {
  const opts: SignOptions = { expiresIn: '15m', audience: ACCESS_AUDIENCE };
  return jwt.sign({ ...payload, type: 'access' }, getConfig().JWT_SECRET, opts);
}

export function signRefreshToken(payload: { sub: string; tenantId: string }): string {
  // jti aleatório garante que dois refresh tokens emitidos no mesmo segundo sejam diferentes
  const opts: SignOptions = { expiresIn: '30d', jwtid: randomUUID() };
  return jwt.sign({ ...payload, type: 'refresh' }, getConfig().JWT_REFRESH_SECRET, opts);
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, getConfig().JWT_SECRET, { audience: ACCESS_AUDIENCE, algorithms: ['HS256'] }) as JwtPayload & { type?: string };
  if (decoded.type !== 'access') {
    throw new jwt.JsonWebTokenError('Tipo de token inválido');
  }
  return decoded;
}

export function verifyRefreshToken(token: string): { sub: string; tenantId: string } {
  const decoded = jwt.verify(token, getConfig().JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as { sub: string; tenantId: string; type?: string };
  if (decoded.type && decoded.type !== 'refresh') {
    throw new jwt.JsonWebTokenError('Tipo de token inválido');
  }
  return decoded;
}

/** Segredo do token temporário do 2FA — derivado, nunca igual ao do access token */
function twoFactorSecret(): string {
  return `${getConfig().JWT_SECRET}:2fa`;
}

export function sign2FATempToken(payload: { sub: string; tenantId: string }): string {
  return jwt.sign({ ...payload, type: '2fa' }, twoFactorSecret(), { expiresIn: '5m', audience: TWO_FA_AUDIENCE });
}

export function verify2FATempToken(token: string): { sub: string; tenantId: string } {
  const decoded = jwt.verify(token, twoFactorSecret(), { audience: TWO_FA_AUDIENCE, algorithms: ['HS256'] }) as { sub: string; tenantId: string; type?: string };
  if (decoded.type !== '2fa') {
    throw new jwt.JsonWebTokenError('Tipo de token inválido');
  }
  return decoded;
}
