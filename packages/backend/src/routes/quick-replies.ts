import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

const upsertSchema = z.object({
  shortcode: z.string().min(1).max(50),
  content: z.string().min(1).max(2000),
  category: z.string().max(100).optional(),
});

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const replies = await prisma.quickReply.findMany({
    where: { tenantId: req.user!.tenantId },
    orderBy: [{ category: 'asc' }, { shortcode: 'asc' }],
  });
  res.json(replies);
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const data = upsertSchema.parse(req.body);
  const reply = await prisma.quickReply.create({
    data: { ...data, tenantId: req.user!.tenantId },
  });
  res.status(201).json(reply);
}));

router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = upsertSchema.partial().parse(req.body);
  const reply = await prisma.quickReply.update({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
    data,
  });
  res.json(reply);
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await prisma.quickReply.delete({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });
  res.json({ ok: true });
}));

export default router;
