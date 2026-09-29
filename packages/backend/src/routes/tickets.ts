import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as ticketService from '../services/ticket.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

/** "A,B" → ['A', 'B'] */
const commaList = z.string().transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean));

const listQuerySchema = z.object({
  // Status do atendimento: PENDING, OPEN, CLOSED (um ou vários separados por vírgula)
  status: commaList.pipe(z.array(z.enum(['PENDING', 'OPEN', 'CLOSED'], {
    errorMap: () => ({ message: 'Filtro "status" inválido. Use PENDING, OPEN ou CLOSED.' }),
  }))).optional(),
  // Quem está respondendo a conversa: ACTIVE (IA), HUMAN_TAKEOVER (pessoa), PENDING (fora do horário), RESOLVED
  aiStatus: commaList.pipe(z.array(z.enum(['ACTIVE', 'HUMAN_TAKEOVER', 'PENDING', 'RESOLVED'], {
    errorMap: () => ({ message: 'Filtro "aiStatus" inválido. Use ACTIVE, HUMAN_TAKEOVER, PENDING ou RESOLVED.' }),
  }))).optional(),
  queueId: z.string().optional(),
  assignedTo: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number({ invalid_type_error: 'Página inválida.' }).int('Página inválida.').min(1, 'Página inválida.').optional(),
  withUnreadMessages: z.string().optional(),
});

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const q = listQuerySchema.parse(req.query);
  const result = await ticketService.listTickets(req.user!.tenantId, {
    status: q.status,
    aiStatus: q.aiStatus,
    queueId: q.queueId,
    assignedTo: q.assignedTo,
    search: q.search,
    page: q.page,
    withUnreadMessages: q.withUnreadMessages === 'true',
  });
  res.json(result);
}));

router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = await ticketService.getTicketStats(req.user!.tenantId, req.user!.sub);
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
