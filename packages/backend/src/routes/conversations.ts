import { Router, Request, Response } from 'express';
import * as conversationService from '../services/conversation.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError } from '../lib/errors.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const conversation = await conversationService.createConversation(req.user!.tenantId, req.body);
  res.status(201).json(conversation);
}));

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const conversations = await conversationService.listConversations(
    req.user!.tenantId,
    {
      status: req.query.status as string | undefined,
      agentId: req.query.agentId as string | undefined,
      page: parseInt(req.query.page as string) || undefined,
    }
  );
  res.json(conversations);
}));

router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = await conversationService.getConversationStats(req.user!.tenantId);
  res.json(stats);
}));

router.get('/stats/daily', asyncHandler(async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 14;
  const daily = await conversationService.getDailyStats(req.user!.tenantId, days);
  res.json(daily);
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const conversation = await conversationService.getConversation(req.user!.tenantId, req.params.id);
  res.json(conversation);
}));

router.post('/:id/messages', asyncHandler(async (req: Request, res: Response) => {
  const message = await conversationService.sendMessage(
    req.user!.tenantId,
    req.params.id,
    req.body,
    req.user!.sub
  );
  res.status(201).json(message);
}));

router.post('/:id/escalate', asyncHandler(async (req: Request, res: Response) => {
  const conversation = await conversationService.escalateConversation(
    req.user!.tenantId,
    req.params.id,
    req.user!.sub
  );
  res.json(conversation);
}));

router.post('/:id/resolve', asyncHandler(async (req: Request, res: Response) => {
  const conversation = await conversationService.resolveConversation(req.user!.tenantId, req.params.id);
  res.json(conversation);
}));

router.post('/:id/return-to-agent', asyncHandler(async (req: Request, res: Response) => {
  const conversation = await conversationService.returnToAgent(req.user!.tenantId, req.params.id);
  res.json(conversation);
}));

router.post('/:id/transfer', asyncHandler(async (req: Request, res: Response) => {
  const { toUserId } = req.body;
  if (!toUserId) throw new ValidationError('toUserId é obrigatório');
  const conversation = await conversationService.transferConversation(
    req.user!.tenantId,
    req.params.id,
    toUserId
  );
  res.json(conversation);
}));

router.post('/:id/note', asyncHandler(async (req: Request, res: Response) => {
  const { content } = req.body;
  if (!content) throw new ValidationError('Conteúdo da nota é obrigatório');
  const message = await conversationService.addInternalNote(
    req.user!.tenantId,
    req.params.id,
    content,
    req.user!.sub
  );
  res.status(201).json(message);
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await conversationService.deleteConversation(req.user!.tenantId, req.params.id);
  res.json({ ok: true });
}));

export default router;
