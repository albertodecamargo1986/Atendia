import { Router, Request, Response } from 'express';
import * as ratingService from '../services/rating.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError } from '../lib/errors.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

// Static routes MUST come before dynamic /:ticketId routes
router.get('/summary', asyncHandler(async (req: Request, res: Response) => {
  const result = await ratingService.getRatingsSummary(req.user!.tenantId);
  res.json(result);
}));

router.post('/:ticketId/rate', asyncHandler(async (req: Request, res: Response) => {
  const { score, comment } = req.body;
  if (!score || score < 1 || score > 5) throw new ValidationError('Nota deve ser entre 1 e 5');
  const result = await ratingService.rateTicket(req.params.ticketId, req.user!.tenantId, score, comment);
  res.status(201).json(result);
}));

router.get('/:ticketId/rating', asyncHandler(async (req: Request, res: Response) => {
  const result = await ratingService.getRating(req.params.ticketId, req.user!.tenantId);
  res.json(result);
}));

export default router;
