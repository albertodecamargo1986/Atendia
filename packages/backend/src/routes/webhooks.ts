import { Router, Request, Response } from 'express';
import * as webhookService from '../services/webhook.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError } from '../lib/errors.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const result = await webhookService.listWebhooks(req.user!.tenantId);
  res.json(result);
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { url, events, secret } = req.body;
  if (!url || !events?.length) throw new ValidationError('URL e eventos são obrigatórios');
  const result = await webhookService.createWebhook(req.user!.tenantId, url, events, secret);
  res.status(201).json(result);
}));

router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const result = await webhookService.updateWebhook(req.params.id, req.user!.tenantId, req.body);
  res.json(result);
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await webhookService.deleteWebhook(req.params.id, req.user!.tenantId);
  res.json({ ok: true });
}));

router.post('/:id/test', asyncHandler(async (req: Request, res: Response) => {
  const result = await webhookService.testWebhook(req.params.id, req.user!.tenantId);
  res.json(result);
}));

router.get('/:id/deliveries', asyncHandler(async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const result = await webhookService.getDeliveries(req.params.id, req.user!.tenantId, limit);
  res.json(result);
}));

export default router;
