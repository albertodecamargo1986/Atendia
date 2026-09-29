import { Router, Request, Response } from 'express';
import * as onboardingService from '../services/onboarding.service.js';
import { authMiddleware, requireTenantAdmin } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

// { steps: { company, whatsapp, aiKey, agent, businessHours }, completed, completedAt }
router.get('/progress', asyncHandler(async (req: Request, res: Response) => {
  const progress = await onboardingService.getOnboardingProgress(req.user!.tenantId);
  res.json(progress);
}));

router.post('/complete', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const progress = await onboardingService.markOnboardingDone(req.user!.tenantId);
  res.json(progress);
}));

router.post('/skip', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const progress = await onboardingService.markOnboardingDone(req.user!.tenantId);
  res.json(progress);
}));

// Extra (não obrigatório no contrato): passo 1 "Dados da empresa" — { name }
router.patch('/company', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const tenant = await onboardingService.updateCompany(req.user!.tenantId, req.body);
  res.json(tenant);
}));

export default router;
