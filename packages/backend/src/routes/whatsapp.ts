import { Router, Request, Response } from 'express';
import * as whatsappService from '../services/whatsapp.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const sessions = await whatsappService.listSessions(req.user!.tenantId);
  res.json(sessions);
}));

router.post('/connect', asyncHandler(async (req: Request, res: Response) => {
  const session = await whatsappService.connectSession(req.user!.tenantId, req.body);
  res.status(201).json(session);
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const session = await whatsappService.getSessionStatus(req.user!.tenantId, req.params.id);
  res.json(session);
}));

router.post('/:id/reconnect', asyncHandler(async (req: Request, res: Response) => {
  const session = await whatsappService.reconnectSession(req.user!.tenantId, req.params.id);
  res.json(session);
}));

router.post('/:id/disconnect', asyncHandler(async (req: Request, res: Response) => {
  const session = await whatsappService.disconnectSession(req.user!.tenantId, req.params.id);
  res.json(session);
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await whatsappService.deleteSession(req.user!.tenantId, req.params.id);
  res.json({ success: true });
}));

export default router;
