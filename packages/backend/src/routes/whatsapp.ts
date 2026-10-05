import { Router, Request, Response } from 'express';
import * as whatsappService from '../services/whatsapp.service.js';
import * as cloudService from '../services/whatsapp-cloud.service.js';
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

/**
 * O que o painel recebe de uma sessão: sem QR para quem não é OWNER/ADMIN e NUNCA as credenciais
 * (nem as do QR Code nem as da API oficial, mesmo cifradas) — só "configurado ✓" e últimos 4.
 */
function publicSession<T extends { qrCode?: string | null }>(req: Request, session: T | null) {
  if (!session) return session;
  const safe = cloudService.toPublicSession(session as any) as T;
  return canSeeQr(req) ? safe : { ...safe, qrCode: null };
}

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const sessions = await whatsappService.listSessions(req.user!.tenantId);
  res.json(sessions.map((s) => publicSession(req, s)));
}));

router.post('/connect', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const session = await whatsappService.connectSession(req.user!.tenantId, req.body);
  res.status(201).json(publicSession(req, session));
}));

// ─── Conexão oficial (Cloud API da Meta) — só OWNER/ADMIN ────────────────────

/** Assistente: o servidor já tem domínio com HTTPS? (a Meta só chama webhooks HTTPS) */
router.get('/cloud/setup-info', requireTenantAdmin, asyncHandler(async (_req: Request, res: Response) => {
  const { publicUrl, httpsReady } = cloudService.getPublicBase();
  res.json({ publicUrl, httpsReady, webhookBaseUrl: httpsReady ? `${publicUrl}/api/whatsapp/cloud/webhook/` : null });
}));

/** Cadastra o número oficial: { phoneNumberId, wabaId, accessToken, appSecret, agentId? } (já testa). */
router.post('/cloud', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const result = await cloudService.createCloudSession(req.user!.tenantId, req.body);
  res.status(201).json(result);
}));

/** Detalhes da conexão oficial (URL do webhook, verify token, qualidade/tier) — sem segredos. */
router.get('/cloud/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  res.json(await cloudService.getCloudSessionDetails(req.user!.tenantId, req.params.id));
}));

/** Troca credenciais (campos vazios mantêm as salvas) e testa de novo. */
router.patch('/cloud/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  res.json(await cloudService.updateCloudSession(req.user!.tenantId, req.params.id, req.body));
}));

/** "Testar conexão": nome verificado, número, qualidade e tier na Meta. */
router.post('/cloud/:id/test', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  res.json(await cloudService.testCloudSession(req.user!.tenantId, req.params.id));
}));

/** Modelos aprovados (cache 1 h; ?refresh=true busca de novo na Meta). */
router.get('/cloud/:id/templates', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  res.json(await cloudService.listSessionTemplates(req.user!.tenantId, req.params.id, { refresh: req.query.refresh === 'true' }));
}));

/** Mensagem de teste: { to, text? } — hello_world se o número não falou com você nas últimas 24 h. */
router.post('/cloud/:id/test-message', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  res.json(await cloudService.sendCloudTestMessage(req.user!.tenantId, req.params.id, req.body));
}));

// ─── Comum aos dois tipos ───────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const session = await whatsappService.getSessionStatus(req.user!.tenantId, req.params.id);
  res.json(publicSession(req, session));
}));

// Define qual agente atende este número: { agentId: string | null }
router.patch('/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const session = await whatsappService.updateSession(req.user!.tenantId, req.params.id, req.body);
  res.json(publicSession(req, session));
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
  res.json(publicSession(req, session));
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
  res.json(publicSession(req, session));
}));

router.delete('/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  await whatsappService.deleteSession(req.user!.tenantId, req.params.id);
  res.json({ success: true });
}));

export default router;
