import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, requireTenantAdmin } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { requireModule } from '../middlewares/feature-gate.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware, tenantMiddleware, requireModule('tags'));

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

router.post('/', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const data = tagSchema.parse(req.body);
  const tag = await prisma.tag.create({
    data: { ...data, tenantId: req.user!.tenantId },
  });
  res.status(201).json(tag);
}));

router.patch('/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const data = tagSchema.partial().parse(req.body);
  const tag = await prisma.tag.update({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
    data,
  });
  res.json(tag);
}));

router.delete('/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
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
  if (!ticket) throw new NotFoundError('Atendimento', req.params.ticketId);
  // IDOR: a etiqueta precisa ser do mesmo tenant
  const tag = await prisma.tag.findFirst({ where: { id: String(tagId), tenantId: req.user!.tenantId } });
  if (!tag) throw new NotFoundError('Etiqueta', String(tagId));
  const link = await prisma.ticketTag.upsert({
    where: { ticketId_tagId: { ticketId: ticket.id, tagId: tag.id } },
    update: {},
    create: { ticketId: ticket.id, tagId: tag.id },
  });
  res.status(201).json(link);
}));

router.delete('/ticket/:ticketId/:tagId', asyncHandler(async (req: Request, res: Response) => {
  // IDOR: só remove vínculos de atendimentos do próprio tenant
  const ticket = await prisma.ticket.findFirst({
    where: { id: req.params.ticketId, tenantId: req.user!.tenantId },
    select: { id: true },
  });
  if (!ticket) throw new NotFoundError('Atendimento', req.params.ticketId);
  await prisma.ticketTag.deleteMany({
    where: { ticketId: ticket.id, tagId: req.params.tagId },
  });
  res.json({ ok: true });
}));

export default router;
