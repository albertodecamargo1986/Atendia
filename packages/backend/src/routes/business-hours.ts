import { Router, Request, Response } from 'express';
import * as businessHoursService from '../services/business-hours.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError } from '../lib/errors.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const hours = await businessHoursService.listBusinessHours(req.user!.tenantId);
  res.json(hours);
}));

router.put('/:dayOfWeek', asyncHandler(async (req: Request, res: Response) => {
  const dayOfWeek = parseInt(req.params.dayOfWeek, 10);
  if (dayOfWeek < 0 || dayOfWeek > 6) throw new ValidationError('dayOfWeek deve ser 0-6');
  const { isOpen, openTime, closeTime } = req.body;
  const updated = await businessHoursService.updateBusinessHour(
    req.user!.tenantId,
    dayOfWeek,
    { dayOfWeek, isOpen, openTime, closeTime }
  );
  res.json(updated);
}));

export default router;
