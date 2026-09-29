import { Router, Request, Response } from 'express';
import * as queueService from '../services/queue.service.js';
import { authMiddleware, requireTenantAdmin } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { requireModule } from '../middlewares/feature-gate.js';
import { asyncHandler } from '../middlewares/async-handler.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware, requireModule('queues'));

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const queues = await queueService.listQueues(req.user!.tenantId);
  res.json(queues);
}));

router.post('/', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const queue = await queueService.createQueue(req.user!.tenantId, req.body);
  res.status(201).json(queue);
}));

router.patch('/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const queue = await queueService.updateQueue(req.user!.tenantId, req.params.id, req.body);
  res.json(queue);
}));

router.delete('/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const queue = await queueService.deleteQueue(req.user!.tenantId, req.params.id);
  res.json(queue);
}));

router.post('/:id/users/:userId', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const result = await queueService.addUserToQueue(req.user!.tenantId, req.params.userId, req.params.id);
  res.status(201).json(result);
}));

router.delete('/:id/users/:userId', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  await queueService.removeUserFromQueue(req.user!.tenantId, req.params.userId, req.params.id);
  res.status(204).end();
}));

router.post('/:id/whatsapp/:sessionId', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const result = await queueService.addWhatsappToQueue(req.user!.tenantId, req.params.sessionId, req.params.id);
  res.status(201).json(result);
}));

router.delete('/:id/whatsapp/:sessionId', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  await queueService.removeWhatsappFromQueue(req.user!.tenantId, req.params.sessionId, req.params.id);
  res.status(204).end();
}));

export default router;
