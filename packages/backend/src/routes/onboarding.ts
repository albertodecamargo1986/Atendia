import { Router, Request, Response } from 'express';
import * as onboardingService from '../services/onboarding.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.get('/progress', asyncHandler(async (req: Request, res: Response) => {
  const progress = await onboardingService.getOnboardingProgress(req.user!.tenantId);
  res.json(progress);
}));

export default router;
