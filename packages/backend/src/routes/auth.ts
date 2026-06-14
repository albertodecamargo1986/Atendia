import { Router, Request, Response } from 'express';
import * as authService from '../services/auth.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError } from '../lib/errors.js';
import prisma from '../lib/prisma.js';
import { getConfig } from '../config/index.js';

const router = Router();

// ── SEGURANÇA MELHORADA: httpOnly cookies ──
function setTokenCookies(res: Response, accessToken: string, refreshToken: string) {
  const config = getConfig();
  const isProduction = config.NODE_ENV === 'production';
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 15 * 60 * 1000, // 15 min
    path: '/',
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge,
    path: '/auth',
  });
}

function clearTokenCookies(res: Response) {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/auth' });
}

router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body);
  setTokenCookies(res, result.accessToken, result.refreshToken);
  res.status(201).json(result);
}));

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body);
  setTokenCookies(res, result.accessToken, result.refreshToken);
  res.json(result);
}));

router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  // Aceita token do cookie OU do body
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!refreshToken) throw new ValidationError('Refresh token obrigatório');
  const result = await authService.refresh(refreshToken);
  setTokenCookies(res, result.accessToken, result.refreshToken);
  res.json(result);
}));

router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  clearTokenCookies(res);
  res.json({ message: 'Logout realizado com sucesso' });
}));

router.get('/me', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const [user, tenant] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
      select: { id: true, name: true, slug: true, plan: true },
    }),
  ]);
  res.json({
    user: {
      ...req.user,
      name: user?.name || req.user!.email,
      tenantName: tenant?.name || '',
      tenantSlug: tenant?.slug || '',
    },
  });
}));

export default router;