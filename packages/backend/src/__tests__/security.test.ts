import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { requireRole } from '../middlewares/auth.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { isOverLimit } from '../lib/limits.js';
import { toWhatsAppJid, isGroupJid } from '../lib/whatsapp-jid.js';
import { passwordSchema } from '../lib/password.js';
import { verifyMercadoPagoSignature } from '../lib/mercadopago-signature.js';
import { deriveUrls } from '../config/index.js';
import { sanitizeFilename } from '../lib/uploads.js';

function runMiddleware(mw: any, user?: { role: string }) {
  const next = vi.fn();
  mw({ user } as unknown as Request, {} as Response, next);
  return next;
}

describe('requireRole', () => {
  it("requireRole('SUPER_ADMIN') barra OWNER com 403", () => {
    const next = runMiddleware(requireRole('SUPER_ADMIN'), { role: 'OWNER' });
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it("requireRole('SUPER_ADMIN') barra ADMIN do tenant", () => {
    const next = runMiddleware(requireRole('SUPER_ADMIN'), { role: 'ADMIN' });
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it("requireRole('SUPER_ADMIN') libera SUPER_ADMIN", () => {
    const next = runMiddleware(requireRole('SUPER_ADMIN'), { role: 'SUPER_ADMIN' });
    expect(next).toHaveBeenCalledWith();
  });

  it('SUPER_ADMIN sempre passa em rotas de OWNER/ADMIN', () => {
    const next = runMiddleware(requireRole('OWNER', 'ADMIN'), { role: 'SUPER_ADMIN' });
    expect(next).toHaveBeenCalledWith();
  });

  it('OPERATOR é barrado em rotas de configuração', () => {
    const next = runMiddleware(requireRole('OWNER', 'ADMIN'), { role: 'OPERATOR' });
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('sem usuário → 401', () => {
    const next = runMiddleware(requireRole('OWNER'));
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });
});

describe('isOverLimit', () => {
  it('limite -1 é ilimitado', () => {
    expect(isOverLimit(0, -1)).toBe(false);
    expect(isOverLimit(5000, -1)).toBe(false);
  });

  it('respeita limites positivos', () => {
    expect(isOverLimit(0, 1)).toBe(false);
    expect(isOverLimit(1, 1)).toBe(true);
    expect(isOverLimit(2, 3)).toBe(false);
  });
});

describe('JID do WhatsApp', () => {
  it('usa @s.whatsapp.net (não @s.whats.net)', () => {
    expect(toWhatsAppJid('5511999998888')).toBe('5511999998888@s.whatsapp.net');
    expect(toWhatsAppJid('+55 (11) 99999-8888')).toBe('5511999998888@s.whatsapp.net');
  });

  it('mantém JID completo recebido', () => {
    expect(toWhatsAppJid('5511999998888@s.whatsapp.net')).toBe('5511999998888@s.whatsapp.net');
  });

  it('identifica grupos', () => {
    expect(isGroupJid('123-456@g.us')).toBe(true);
    expect(isGroupJid('5511999998888@s.whatsapp.net')).toBe(false);
  });
});

describe('política de senha', () => {
  it('exige 8+ caracteres com letra e número', () => {
    expect(passwordSchema.safeParse('Senha123').success).toBe(true);
    expect(passwordSchema.safeParse('abc12').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
    expect(passwordSchema.safeParse('abcdefgh').success).toBe(false);
  });
});

describe('sanitizeFilename', () => {
  it('remove caminhos, acentos e caracteres perigosos', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('Relatório Final (v2).PDF')).toBe('Relatorio_Final_v2_.pdf');
    expect(sanitizeFilename('..\\..\\win.ini')).not.toContain('..');
  });
});

describe('assinatura do webhook Mercado Pago', () => {
  const secret = 'segredo-de-teste';
  const sign = (manifest: string) => crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  it('aceita assinatura com o manifest oficial', () => {
    const v1 = sign('id:123456;request-id:req-1;ts:1700000000;');
    expect(verifyMercadoPagoSignature({ xSignature: 'ts=1700000000,v1=' + v1, xRequestId: 'req-1', dataId: '123456', secret })).toBe(true);
  });

  it('rejeita assinatura forjada ou de tamanho diferente (sem exceção)', () => {
    expect(verifyMercadoPagoSignature({ xSignature: 'ts=1700000000,v1=abc', xRequestId: 'req-1', dataId: '123456', secret })).toBe(false);
    const other = sign('id:999;request-id:req-1;ts:1700000000;');
    expect(verifyMercadoPagoSignature({ xSignature: 'ts=1700000000,v1=' + other, xRequestId: 'req-1', dataId: '123456', secret })).toBe(false);
    expect(verifyMercadoPagoSignature({ xSignature: undefined, xRequestId: 'req-1', dataId: '1', secret })).toBe(false);
  });
});

describe('URLs derivadas de PUBLIC_URL', () => {
  it('HTTP por IP → cookie não-secure', () => {
    const d = deriveUrls({ PUBLIC_URL: 'http://34.1.2.3' });
    expect(d.FRONTEND_URL).toBe('http://34.1.2.3');
    expect(d.API_URL).toBe('http://34.1.2.3/api');
    expect(d.ALLOWED_ORIGINS).toBe('http://34.1.2.3');
    expect(d.COOKIE_SECURE).toBe(false);
  });

  it('HTTPS → cookie secure (sobrescrevível)', () => {
    expect(deriveUrls({ PUBLIC_URL: 'https://atendia.duckdns.org/' }).COOKIE_SECURE).toBe(true);
    expect(deriveUrls({ PUBLIC_URL: 'https://x.org', COOKIE_SECURE: false }).COOKIE_SECURE).toBe(false);
  });
});

describe('JWT — token temporário do 2FA não vale como access token', () => {
  beforeAll(() => {
    process.env.DATABASE_URL ||= 'postgresql://x:y@localhost:5432/z';
    process.env.JWT_SECRET ||= 'segredo-jwt-de-teste-com-tamanho-ok';
    process.env.JWT_REFRESH_SECRET ||= 'segredo-refresh-de-teste-com-tamanho-ok';
    process.env.SESSION_ENCRYPTION_KEY ||= 'a'.repeat(64);
  });

  it('verifyAccessToken rejeita tempToken e aceita access token', async () => {
    const jwt = await import('../lib/jwt.js');
    const temp = jwt.sign2FATempToken({ sub: 'u1', tenantId: 't1' });
    expect(() => jwt.verifyAccessToken(temp)).toThrow();
    const access = jwt.signAccessToken({ sub: 'u1', email: 'a@b.com', tenantId: 't1', role: 'OWNER', plan: 'FREE' });
    expect(jwt.verifyAccessToken(access).sub).toBe('u1');
    expect(jwt.verify2FATempToken(temp).sub).toBe('u1');
    expect(() => jwt.verify2FATempToken(access)).toThrow();
  });

  it('refresh tokens emitidos no mesmo instante são diferentes (jti)', async () => {
    const jwt = await import('../lib/jwt.js');
    const a = jwt.signRefreshToken({ sub: 'u1', tenantId: 't1' });
    const b = jwt.signRefreshToken({ sub: 'u1', tenantId: 't1' });
    expect(a).not.toBe(b);
  });
});
