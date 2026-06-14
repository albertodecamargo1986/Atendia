import { Router, Request, Response } from 'express';
import * as twoFactorService from '../services/two-factor.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError } from '../lib/errors.js';

const router = Router();
router.use(authMiddleware);

router.post('/setup', asyncHandler(async (req: Request, res: Response) => {
  const result = await twoFactorService.setup2FA(req.user!.sub);
  res.json(result);
}));

router.post('/enable', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) throw new ValidationError('Token é obrigatório');
  await twoFactorService.enable2FA(req.user!.sub, token);
  res.json({ message: '2FA ativado com sucesso' });
}));

router.post('/disable', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) throw new ValidationError('Token é obrigatório');
  await twoFactorService.disable2FA(req.user!.sub, token);
  res.json({ message: '2FA desativado com sucesso' });
}));

export default router;
