import { Router, Request, Response } from 'express';
import * as campaignService from '../services/campaign.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { requireModule } from '../middlewares/feature-gate.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware, requireModule('campaigns'));

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const result = await campaignService.listCampaigns(tenantId);
  res.json({ success: true, data: result });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const result = await campaignService.getCampaign(req.params.id, tenantId);
  if (!result) throw new NotFoundError('Campanha', req.params.id);
  res.json({ success: true, data: result });
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const { name, message, contactIds, scheduledAt } = req.body;
  if (!name || !message || !contactIds?.length) {
    throw new ValidationError('Nome, mensagem e contatos são obrigatórios');
  }
  const result = await campaignService.createCampaign(
    tenantId,
    name,
    message,
    contactIds,
    scheduledAt ? new Date(scheduledAt) : undefined,
  );
  res.status(201).json({ success: true, data: result });
}));

router.post('/:id/start', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const result = await campaignService.startCampaign(req.params.id, tenantId);
  res.json({ success: true, data: result });
}));

router.post('/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const result = await campaignService.cancelCampaign(req.params.id, tenantId);
  res.json({ success: true, data: result });
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  await campaignService.deleteCampaign(req.params.id, tenantId);
  res.json({ success: true });
}));

export default router;
