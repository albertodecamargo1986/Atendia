import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { getUploadRoot } from '../config/index.js';
import { verifyAccessToken } from './jwt.js';
import { ForbiddenError, UnauthorizedError, ValidationError } from './errors.js';

/**
 * Layout de arquivos enviados:
 *   UPLOAD_DIR/<tenantId>/<arquivo>              (mídias do chat)
 *   UPLOAD_DIR/<tenantId>/audio/<arquivo>        (áudios recebidos / TTS)
 *   UPLOAD_DIR/<tenantId>/knowledge/<arquivo>    (base de conhecimento)
 *   UPLOAD_DIR/<tenantId>/voice-samples/<arq>    (amostras temporárias de voz)
 * URL pública: /uploads/<tenantId>/... — servida só para usuários do mesmo tenant.
 */

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

function assertSafeSegment(segment: string, label: string) {
  if (!SAFE_SEGMENT.test(segment)) {
    throw new ValidationError(`${label} inválido`);
  }
}

/** Remove caminhos, acentos e caracteres perigosos de um nome de arquivo enviado. */
export function sanitizeFilename(originalName: string | undefined | null, fallback = 'arquivo'): string {
  const base = path.basename(String(originalName || '')).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ext = path.extname(base).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10);
  const name = path
    .basename(base, path.extname(base))
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 80);
  return `${name || fallback}${ext}`;
}

/** Diretório absoluto do tenant (criado se não existir). */
export function tenantUploadDir(tenantId: string, sub?: string): string {
  assertSafeSegment(tenantId, 'Tenant');
  if (sub) assertSafeSegment(sub, 'Subpasta');
  const dir = sub ? path.join(getUploadRoot(), tenantId, sub) : path.join(getUploadRoot(), tenantId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** URL pública (/uploads/<tenantId>/[sub/]<arquivo>) de um arquivo do tenant. */
export function tenantUploadUrl(tenantId: string, fileName: string, sub?: string): string {
  const parts = ['/uploads', tenantId];
  if (sub) parts.push(sub);
  parts.push(path.basename(fileName));
  return parts.join('/');
}

/** Converte um caminho absoluto dentro de UPLOAD_DIR em URL /uploads/... */
export function uploadPathToUrl(absolutePath: string): string {
  const root = getUploadRoot();
  const rel = path.relative(root, path.resolve(absolutePath));
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new ForbiddenError('Arquivo fora da pasta de uploads');
  }
  return `/uploads/${rel.split(path.sep).join('/')}`;
}

/**
 * Converte uma URL /uploads/... (ou caminho legado relativo ao cwd) em caminho
 * absoluto, garantindo que fique dentro de UPLOAD_DIR. Retorna null se inválido.
 */
export function resolveUploadPath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  const root = getUploadRoot();
  let candidate: string;
  if (urlOrPath.startsWith('/uploads/')) {
    candidate = path.resolve(root, '.' + urlOrPath.slice('/uploads'.length));
  } else {
    candidate = path.resolve(process.cwd(), urlOrPath);
  }
  const rel = path.relative(root, candidate);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return candidate;
}

/**
 * Middleware de acesso a /uploads: aceita Bearer ou cookie httpOnly `accessToken`
 * e só libera arquivos cujo primeiro segmento do caminho é o tenant do usuário
 * (SUPER_ADMIN acessa qualquer tenant).
 */
export function uploadsAccessMiddleware(req: Request, _res: Response, next: NextFunction) {
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const cookieToken = (req as any).cookies?.accessToken as string | undefined;
  const token = headerToken || cookieToken;
  if (!token) return next(new UnauthorizedError('Token não fornecido'));

  let user;
  try {
    user = verifyAccessToken(token);
  } catch {
    return next(new UnauthorizedError('Token inválido ou expirado'));
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(req.path || '');
  } catch {
    return next(new ForbiddenError('Caminho inválido'));
  }
  const segments = decoded.split('/').filter(Boolean);
  if (segments.length < 2 || segments.some((s) => s === '..' || s.startsWith('.'))) {
    return next(new ForbiddenError('Acesso negado'));
  }

  const [tenantSegment] = segments;
  if (tenantSegment !== user.tenantId && user.role !== 'SUPER_ADMIN') {
    return next(new ForbiddenError('Acesso negado'));
  }

  req.user = user;
  next();
}
