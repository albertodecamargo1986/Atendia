import { Router, Request, Response } from 'express';
import * as whatsappService from '../services/whatsapp.service.js';
import { authMiddleware, requireTenantAdmin, TENANT_ADMIN_ROLES } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

/** QR Code dá acesso ao número: só OWNER/ADMIN (e SUPER_ADMIN) podem ver. */
function canSeeQr(req: Request): boolean {
  const role = req.user?.role;
  return role === 'SUPER_ADMIN' || (TENANT_ADMIN_ROLES as readonly string[]).includes(role || '');
}

function hideQr<T extends { qrCode?: string | null }>(req: Request, session: T): T {
  return canSeeQr(req) ? session : { ...session, qrCode: null };
}

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const sessions = await whatsappService.listSessions(req.user!.tenantId);
  res.json(sessions.map((s) => hideQr(req, s)));
}));

router.post('/connect', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const session = await whatsappService.connectSession(req.user!.tenantId, req.body);
  res.status(201).json(session);
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const session = await whatsappService.getSessionStatus(req.user!.tenantId, req.params.id);
  res.json(hideQr(req, session));
}));

// Define qual agente atende este número: { agentId: string | null }
router.patch('/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const session = await whatsappService.updateSession(req.user!.tenantId, req.params.id, req.body);
  res.json(session);
}));

router.get('/:id/qr', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const session = await whatsappService.getSessionStatus(req.user!.tenantId, req.params.id);
  res.json({ qrCode: (session as any).qrCode || null });
}));

router.post('/:id/reconnect', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  // Número bloqueado/limitado só reconecta com { confirm: true } explícito
  const session = await whatsappService.reconnectSession(req.user!.tenantId, req.params.id, {
    confirm: req.body?.confirm === true,
  });
  res.json(session);
}));

/** Situação de restrição (463/475, limite diário) e histórico de incidentes do número. */
router.get('/:id/restriction', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  res.json(await whatsappService.getRestrictionInfo(req.user!.tenantId, req.params.id));
}));

/** OWNER/ADMIN libera a pausa de envios automáticos ({ enableCampaigns: true } religa campanhas). */
router.delete('/:id/restriction', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const info = await whatsappService.clearRestriction(req.user!.tenantId, req.params.id, {
    enableCampaigns: req.body?.enableCampaigns === true || req.query.enableCampaigns === 'true',
  });
  res.json(info);
}));

router.post('/:id/disconnect', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const session = await whatsappService.disconnectSession(req.user!.tenantId, req.params.id);
  res.json(session);
}));

router.delete('/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  await whatsappService.deleteSession(req.user!.tenantId, req.params.id);
  res.json({ success: true });
}));

export default router;
