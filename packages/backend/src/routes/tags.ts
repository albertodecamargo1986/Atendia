import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

const tagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().default('#6366f1'),
});

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const tags = await prisma.tag.findMany({
    where: { tenantId: req.user!.tenantId },
    include: { _count: { select: { tickets: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(tags);
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data = tagSchema.parse(req.body);
  const tag = await prisma.tag.create({
    data: { ...data, tenantId: req.user!.tenantId },
  });
  res.status(201).json(tag);
}));

router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = tagSchema.partial().parse(req.body);
  const tag = await prisma.tag.update({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
    data,
  });
  res.json(tag);
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await prisma.tag.delete({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });
  res.json({ ok: true });
}));

// Tag/untag a ticket
router.post('/ticket/:ticketId', asyncHandler(async (req: Request, res: Response) => {
  const { tagId } = req.body;
  if (!tagId) throw new ValidationError('tagId é obrigatório');
  const ticket = await prisma.ticket.findFirst({
    where: { id: req.params.ticketId, tenantId: req.user!.tenantId },
  });
  if (!ticket) throw new NotFoundError('Ticket', req.params.ticketId);
  const link = await prisma.ticketTag.create({
    data: { ticketId: ticket.id, tagId },
  });
  res.status(201).json(link);
}));

router.delete('/ticket/:ticketId/:tagId', asyncHandler(async (req: Request, res: Response) => {
  await prisma.ticketTag.delete({
    where: {
      ticketId_tagId: {
        ticketId: req.params.ticketId,
        tagId: req.params.tagId,
      },
    },
  });
  res.json({ ok: true });
}));

export default router;
