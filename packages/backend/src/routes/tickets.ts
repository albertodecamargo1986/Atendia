import { Router, Request, Response } from 'express';
import * as ticketService from '../services/ticket.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const result = await ticketService.listTickets(req.user!.tenantId, {
    status: req.query.status as string | undefined,
    queueId: req.query.queueId as string | undefined,
    assignedTo: req.query.assignedTo as string | undefined,
    search: req.query.search as string | undefined,
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
    withUnreadMessages: req.query.withUnreadMessages === 'true',
  });
  res.json(result);
}));

router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = await ticketService.getTicketStats(req.user!.tenantId);
  res.json(stats);
}));

router.get('/queue-counts', asyncHandler(async (req: Request, res: Response) => {
  const counts = await ticketService.getTicketCountByQueue(req.user!.tenantId);
  res.json(counts);
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketService.getTicket(req.user!.tenantId, req.params.id);
  res.json(ticket);
}));

router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { status, assignedTo, queueId } = req.body;
  const ticket = await ticketService.updateTicket(req.user!.tenantId, req.params.id, {
    status,
    assignedTo,
    queueId,
  });
  res.json(ticket);
}));

router.post('/:id/accept', asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketService.acceptTicket(req.user!.tenantId, req.params.id, req.user!.sub);
  res.json(ticket);
}));

router.post('/:id/close', asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketService.closeTicket(req.user!.tenantId, req.params.id);
  res.json(ticket);
}));

router.post('/:id/reopen', asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketService.reopenTicket(req.user!.tenantId, req.params.id);
  res.json(ticket);
}));

router.post('/:id/read', asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketService.markAsRead(req.user!.tenantId, req.params.id);
  res.json(ticket);
}));

export default router;
