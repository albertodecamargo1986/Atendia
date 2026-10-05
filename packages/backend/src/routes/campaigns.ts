import { Router, Request, Response } from 'express';
import * as campaignService from '../services/campaign.service.js';
import { authMiddleware, requireTenantAdmin } from '../middlewares/auth.js';
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

/** Regras da política de envio (exibidas no painel). */
router.get('/rules', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: campaignService.CAMPAIGN_RULES });
}));

/** Contatos que podem receber campanha DESTE número (conversaram com ele nos últimos 90 dias e não pediram para sair). */
router.get('/eligible-contacts', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const requested = typeof req.query.whatsappSessionId === 'string' && req.query.whatsappSessionId ? req.query.whatsappSessionId : null;
  const session = await campaignService.resolveCampaignSession(tenantId, requested);
  const contacts = await campaignService.getEligibleContacts(tenantId, undefined, session.id);
  res.json({ success: true, data: { contacts, count: contacts.length, whatsappSessionId: session.id } });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const result = await campaignService.getCampaign(req.params.id, tenantId);
  if (!result) throw new NotFoundError('Campanha', req.params.id);
  res.json({ success: true, data: result });
}));

router.post('/', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const { name, message, contactIds, scheduledAt, whatsappSessionId } = req.body;
  if (!name || !message || !contactIds?.length) {
    throw new ValidationError('Nome, mensagem e contatos são obrigatórios');
  }
  const result = await campaignService.createCampaign(
    tenantId,
    name,
    message,
    contactIds,
    scheduledAt ? new Date(scheduledAt) : undefined,
    typeof whatsappSessionId === 'string' && whatsappSessionId ? whatsappSessionId : null,
  );
  res.status(201).json({ success: true, data: result });
}));

router.post('/:id/start', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const result = await campaignService.startCampaign(req.params.id, tenantId);
  res.json({ success: true, data: result });
}));

router.post('/:id/pause', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const result = await campaignService.pauseCampaign(req.params.id, tenantId);
  res.json({ success: true, data: result });
}));

router.post('/:id/cancel', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const result = await campaignService.cancelCampaign(req.params.id, tenantId);
  res.json({ success: true, data: result });
}));

router.delete('/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  await campaignService.deleteCampaign(req.params.id, tenantId);
  res.json({ success: true });
}));

export default router;
