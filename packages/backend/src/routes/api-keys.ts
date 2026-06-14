import { Router, Request, Response } from 'express';
import * as apiKeysService from '../services/api-keys.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError } from '../lib/errors.js';
import { z } from 'zod';

const saveSchema = z.object({
  provider: z.enum(['OPENAI', 'ANTHROPIC', 'ELEVENLABS']),
  key: z.string().min(1, 'API Key é obrigatória'),
});

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const keys = await apiKeysService.listApiKeys(req.user!.tenantId);
  res.json(keys);
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { provider, key } = saveSchema.parse(req.body);
  const result = await apiKeysService.saveApiKey(req.user!.tenantId, provider, key);
  res.json(result);
}));

router.post('/test', asyncHandler(async (req: Request, res: Response) => {
  const { provider } = z.object({ provider: z.enum(['OPENAI', 'ANTHROPIC', 'ELEVENLABS']) }).parse(req.body);
  const result = await apiKeysService.testExistingKey(req.user!.tenantId, provider);
  res.json(result);
}));

router.delete('/:provider', asyncHandler(async (req: Request, res: Response) => {
  const provider = req.params.provider as 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS';
  if (!['OPENAI', 'ANTHROPIC', 'ELEVENLABS'].includes(provider)) {
    throw new ValidationError('Provider inválido. Use OPENAI, ANTHROPIC ou ELEVENLABS');
  }
  await apiKeysService.deleteApiKey(req.user!.tenantId, provider);
  res.json({ success: true });
}));

export default router;
