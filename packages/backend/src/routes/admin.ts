import { Router, Request, Response } from 'express';
import * as adminService from '../services/admin.service.js';
import { authMiddleware, requireRole } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/async-handler.js';

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

export default router;
