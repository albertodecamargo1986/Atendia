import { Router, Request, Response } from 'express';
import * as authService from '../services/auth.service.js';
import * as passwordResetService from '../services/password-reset.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { authLimiter } from '../middlewares/rate-limiter.js';
import { ValidationError } from '../lib/errors.js';
import { getPublicUrls } from '../config/index.js';

const router = Router();

const REFRESH_COOKIE_PATH = '/api/auth';

// ── Cookies httpOnly ──
// `secure` só quando PUBLIC_URL é https (ou COOKIE_SECURE=true): em HTTP por IP
// o navegador descartaria o cookie e as mídias (/uploads) não carregariam.
function setTokenCookies(res: Response, accessToken: string, refreshToken: string) {
  const { COOKIE_SECURE } = getPublicUrls();

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: REFRESH_COOKIE_PATH,
  });
}

function clearTokenCookies(res: Response) {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: REFRESH_COOKIE_PATH });
  res.clearCookie('refreshToken', { path: '/auth' }); // cookie legado (antes do prefixo /api)
}

router.post('/register', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body);
  setTokenCookies(res, result.accessToken, result.refreshToken);
  res.status(201).json(result);
}));

router.post('/login', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body);
  if (result.accessToken && result.refreshToken) {
    setTokenCookies(res, result.accessToken, result.refreshToken);
  }
  res.json(result);
}));

router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
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

// Plano e onboarding lidos do banco (não do JWT)
router.get('/me', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getMe(req.user!.sub);
  res.json({ user });
}));

// ── Recuperação de senha ──
router.post('/forgot-password', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) throw new ValidationError('E-mail é obrigatório');
  const result = await passwordResetService.requestPasswordReset(String(email).trim().toLowerCase());
  res.json(result);
}));

router.post('/reset-password', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body;
  if (!token || !password) throw new ValidationError('Token e nova senha são obrigatórios');
  const result = await passwordResetService.resetPassword(token, password);
  res.json(result);
}));

router.post('/validate-reset-token', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  const result = await passwordResetService.validateResetToken(token);
  res.json(result);
}));

export default router;
