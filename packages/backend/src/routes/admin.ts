import { Router, Request, Response } from 'express';
import * as adminService from '../services/admin.service.js';
import * as onlineService from '../services/online.service.js';
import * as mpSubscriptionService from '../services/mercadopago-subscription.service.js';
import * as planConfigService from '../services/plan-config.service.js';
import { authMiddleware, requireRole } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import prisma from '../lib/prisma.js';
import { passwordSchema } from '../lib/password.js';
import { ValidationError } from '../lib/errors.js';

const router = Router();
// Painel da plataforma: somente o dono da plataforma (SUPER_ADMIN).
// OWNER/ADMIN de clientes recebem 403.
router.use(authMiddleware, requireRole('SUPER_ADMIN'));

/* ── Dashboard ── */
router.get('/dashboard', asyncHandler(async (_req: Request, res: Response) => {
  const stats = await adminService.getDashboardStats();
  res.json(stats);
}));

/* ── Tenants ── */
router.get('/tenants', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string;
  const result = await adminService.listTenants(page, limit, search);
  res.json(result);
}));

router.get('/tenants/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenant = await adminService.getTenant(req.params.id);
  res.json(tenant);
}));

router.patch('/tenants/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenant = await adminService.updateTenant(req.params.id, req.body);
  res.json(tenant);
}));

/* ── Payments ── */
router.get('/payments', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const result = await adminService.listPayments(page, limit);
  res.json(result);
}));

/* ── Permissions ── */
router.get('/permissions', asyncHandler(async (req: Request, res: Response) => {
  const permissions = await adminService.getPermissions(req.user!.tenantId);
  res.json(permissions);
}));

router.post('/permissions', asyncHandler(async (req: Request, res: Response) => {
  const perm = await adminService.upsertPermission({ tenantId: req.user!.tenantId, ...req.body });
  res.json(perm);
}));

router.post('/permissions/seed', asyncHandler(async (_req: Request, res: Response) => {
  await adminService.seedDefaultPermissions(_req.user!.tenantId);
  res.json({ message: 'Permissões padrão criadas com sucesso' });
}));

/* ── Settings ── */
router.get('/settings', asyncHandler(async (_req: Request, res: Response) => {
  const settings = await adminService.getSystemSettings();
  res.json(settings);
}));

/* ── Online Users ── */
router.get('/online', asyncHandler(async (req: Request, res: Response) => {
  // Se tiver tenantId na query, filtra por tenant
  const tenantId = req.query.tenantId as string | undefined;
  const result = await onlineService.getOnlineUsers(tenantId);
  res.json(result);
}));

/* ── Tenant Users Management ── */
router.get('/tenants/:tenantId/users', asyncHandler(async (req: Request, res: Response) => {
  const users = await adminService.adminListUsers(req.params.tenantId);
  res.json(users);
}));

router.post('/tenants/:tenantId/users', asyncHandler(async (req: Request, res: Response) => {
  const user = await adminService.adminCreateUser(req.params.tenantId, req.body);
  res.status(201).json(user);
}));

router.delete('/users/:userId', asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.adminDeleteUser(req.params.userId);
  res.json(result);
}));

router.post('/users/:userId/reset-password', asyncHandler(async (req: Request, res: Response) => {
  const password = passwordSchema.parse(req.body?.password);
  const result = await adminService.adminResetPassword(req.params.userId, password);
  res.json(result);
}));

/* ── Coupons ── */
router.get('/coupons', asyncHandler(async (_req: Request, res: Response) => {
  const coupons = await adminService.listCoupons();
  res.json(coupons);
}));

router.post('/coupons', asyncHandler(async (req: Request, res: Response) => {
  const coupon = await adminService.createCoupon(req.body);
  res.status(201).json(coupon);
}));

router.post('/coupons/:id/toggle', asyncHandler(async (req: Request, res: Response) => {
  const coupon = await adminService.toggleCouponStatus(req.params.id);
  res.json(coupon);
}));

router.delete('/coupons/:id', asyncHandler(async (req: Request, res: Response) => {
  const result = await adminService.deleteCoupon(req.params.id);
  res.json(result);
}));

/* ── Confirm Manual Payment ── */
router.post('/tenants/:id/confirm-payment', asyncHandler(async (req: Request, res: Response) => {
  const { months } = req.body;
  const numMonths = Math.max(1, Math.min(12, parseInt(months) || 1));
  const tenant = await adminService.confirmManualPayment(req.params.id, numMonths);
  res.json(tenant);
}));

/* ── Trial Extension ── */
router.post('/tenants/:id/extend-trial', asyncHandler(async (req: Request, res: Response) => {
  const { days } = req.body;
  if (!days || days < 1) throw new ValidationError('Dias deve ser maior que 0');
  const tenant = await adminService.extendTrial(req.params.id, days);
  res.json(tenant);
}));

/* ── Audit Logs ── */
router.get('/audit-logs', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const tenantId = req.query.tenantId as string | undefined;
  const action = req.query.action as string | undefined;

  const where: any = {};
  if (tenantId) where.tenantId = tenantId;
  if (action) where.action = action;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ logs, total, page, limit, totalPages: Math.ceil(total / limit) });
}));

/* ── Mercado Pago Subscription Wizard ── */
router.get('/mercadopago/status', asyncHandler(async (req: Request, res: Response) => {
  const status = await mpSubscriptionService.getStatus(req.user!.tenantId);
  res.json(status);
}));

router.post('/mercadopago/test-token', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) throw new ValidationError('Token é obrigatório');
  const result = await mpSubscriptionService.testToken(token);
  res.json(result);
}));

router.post('/mercadopago/setup-plans', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) throw new ValidationError('Token é obrigatório');
  const plans = await mpSubscriptionService.setupAllPlans(token);
  res.json({ plans });
}));

router.post('/mercadopago/save-config', asyncHandler(async (req: Request, res: Response) => {
  const { accessToken, isSandbox, preapprovalPlanStarterId, preapprovalPlanProId, preapprovalPlanEnterpriseId, isActive } = req.body;
  if (!accessToken) throw new ValidationError('accessToken é obrigatório');
  const config = await mpSubscriptionService.saveConfig(req.user!.tenantId, {
    accessToken, isSandbox: !!isSandbox,
    preapprovalPlanStarterId, preapprovalPlanProId, preapprovalPlanEnterpriseId, isActive: !!isActive,
  });
  res.json(config);
}));

/* ── Plan Config (planos editáveis) ── */
router.get('/planos', asyncHandler(async (_req: Request, res: Response) => {
  const plans = await planConfigService.getPlans();
  res.json(plans);
}));

router.put('/planos/:planId', asyncHandler(async (req: Request, res: Response) => {
  const plan = await planConfigService.updatePlan(req.params.planId, req.body);
  res.json(plan);
}));

router.post('/planos/:planId/sync-mp', asyncHandler(async (req: Request, res: Response) => {
  const result = await planConfigService.syncPlanToMercadoPago(req.params.planId);
  res.json(result);
}));

export default router;
