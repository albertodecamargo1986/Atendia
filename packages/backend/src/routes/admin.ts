import { Router, Request, Response } from 'express';
import * as adminService from '../services/admin.service.js';
import * as onlineService from '../services/online.service.js';
import { authMiddleware, requireRole } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import prisma from '../lib/prisma.js';

const router = Router();
router.use(authMiddleware, requireRole('OWNER', 'ADMIN'));

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

/* ── Licenses ── */
router.get('/licenses', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string;
  const result = await adminService.listLicenses(page, limit, search);
  res.json(result);
}));

router.post('/licenses', asyncHandler(async (req: Request, res: Response) => {
  const license = await adminService.createLicense(req.body);
  res.status(201).json(license);
}));

router.post('/licenses/:id/revoke', asyncHandler(async (req: Request, res: Response) => {
  const license = await adminService.revokeLicense(req.params.id);
  res.json(license);
}));

/* ── Payments ── */
router.get('/payments', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const result = await adminService.listPayments(page, limit);
  res.json(result);
}));

/* ── Customers ── */
router.get('/customers', asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string;
  const customers = await adminService.listCustomers(search);
  res.json(customers);
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

router.get('/online/count', asyncHandler(async (_req: Request, res: Response) => {
  const count = await onlineService.getOnlineCount();
  res.json({ online: count });
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
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
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

/* ── Trial Extension ── */
router.post('/tenants/:id/extend-trial', asyncHandler(async (req: Request, res: Response) => {
  const { days } = req.body;
  if (!days || days < 1) return res.status(400).json({ error: 'Dias deve ser maior que 0' });
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

export default router;
