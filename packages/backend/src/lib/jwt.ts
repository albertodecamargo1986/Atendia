import jwt, { type SignOptions } from 'jsonwebtoken';
import { getConfig } from '../config/index.js';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  plan: string;
}

export function signAccessToken(payload: JwtPayload): string {
  const opts: SignOptions = { expiresIn: '15m' };
  return jwt.sign(payload, getConfig().JWT_SECRET, opts);
}

export function signRefreshToken(payload: { sub: string; tenantId: string }): string {
  const opts: SignOptions = { expiresIn: '30d' };
  return jwt.sign(payload, getConfig().JWT_REFRESH_SECRET, opts);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, getConfig().JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): { sub: string; tenantId: string } {
  return jwt.verify(token, getConfig().JWT_REFRESH_SECRET) as { sub: string; tenantId: string };
}

export function sign2FATempToken(payload: { sub: string; tenantId: string }): string {
  return jwt.sign(payload, getConfig().JWT_SECRET, { expiresIn: '5m' });
}

export function verify2FATempToken(token: string): { sub: string; tenantId: string } {
  return jwt.verify(token, getConfig().JWT_SECRET) as { sub: string; tenantId: string };
}
