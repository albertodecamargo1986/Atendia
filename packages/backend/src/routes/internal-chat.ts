import { Router, Request, Response } from 'express';
import * as chatService from '../services/internal-chat.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError } from '../lib/errors.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.post('/send', asyncHandler(async (req: Request, res: Response) => {
  const { receiverId, groupId, content } = req.body;
  if (!content || !content.trim()) throw new ValidationError('Conteúdo é obrigatório');
  if (!receiverId && !groupId) throw new ValidationError('Informe receiverId ou groupId');
  const result = await chatService.sendMessage(
    req.user!.tenantId,
    req.user!.sub,
    receiverId || null,
    groupId || null,
    content,
  );
  res.status(201).json(result);
}));

router.get('/direct/:userId', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const result = await chatService.getDirectMessages(req.user!.tenantId, req.user!.sub, req.params.userId, page);
  res.json(result);
}));

router.get('/group/:groupId', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const result = await chatService.getGroupMessages(req.user!.tenantId, req.params.groupId, page);
  res.json(result);
}));

router.post('/:messageId/read', asyncHandler(async (req: Request, res: Response) => {
  await chatService.markAsRead(req.params.messageId, req.user!.tenantId, req.user!.sub);
  res.json({ ok: true });
}));

router.get('/unread', asyncHandler(async (req: Request, res: Response) => {
  const count = await chatService.getUnreadCount(req.user!.sub, req.user!.tenantId);
  res.json({ count });
}));

export default router;
