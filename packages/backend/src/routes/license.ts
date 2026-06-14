import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import prisma from '../lib/prisma.js';
import {
  activateLicense,
  validateLicense,
  recordHeartbeat,
  transferLicense,
  verifyLicenseToken,
  createLicense,
  revokeLicense,
  listLicenses,
} from '../services/license.service.js';

export const licenseRouter = Router();

// ---------- Public endpoints (desktop app uses these) ----------

const activateSchema = z.object({
  serial: z.string().min(1),
  hwid: z.string().min(1),
});

licenseRouter.post('/activate', asyncHandler(async (req: Request, res: Response) => {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));

  const result = await activateLicense(parsed.data.serial, parsed.data.hwid);
  res.json({ success: true, data: result });
}));

const validateSchema = z.object({
  token: z.string().min(1),
  hwid: z.string().min(1),
});

licenseRouter.post('/validate', asyncHandler(async (req: Request, res: Response) => {
  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));

  const result = await validateLicense(parsed.data.token, parsed.data.hwid);
  res.json({ success: true, data: result });
}));

const heartbeatSchema = z.object({
  token: z.string().min(1),
  hwid: z.string().min(1),
  ip: z.string().min(1),
});

licenseRouter.post('/heartbeat', asyncHandler(async (req: Request, res: Response) => {
  const parsed = heartbeatSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));

  const { token, hwid, ip } = parsed.data;

  // Verify token to get serial
  const payload = verifyLicenseToken(token);

  const license = await prisma.license.findUnique({ where: { serial: payload.sub } });
  if (!license) throw new NotFoundError('Licença', payload.sub);

  const result = await recordHeartbeat(license.id, hwid, ip);
  res.json({ success: true, data: result });
}));

const transferSchema = z.object({
  serial: z.string().min(1),
  hwid: z.string().min(1),
  transfer_token: z.string().min(1),
});

licenseRouter.post('/transfer', asyncHandler(async (req: Request, res: Response) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));

  const result = await transferLicense(parsed.data.serial, parsed.data.hwid, parsed.data.transfer_token);
  res.json({ success: true, data: result });
}));

// ---------- Authenticated endpoints (admin panel) ----------

licenseRouter.get(
  '/',
  authMiddleware,
  tenantMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const licenses = await listLicenses({ tenantId: req.user?.tenantId });
    res.json({ success: true, data: licenses });
  }),
);

licenseRouter.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({
      customerId: z.string().min(1),
      plan: z.enum(['STARTER', 'PRO', 'ENTERPRISE']),
      periodMonths: z.number().int().min(1).max(24),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));

    const license = await createLicense(parsed.data);
    res.status(201).json({ success: true, data: license });
  }),
);

licenseRouter.post(
  '/:id/revoke',
  authMiddleware,
  tenantMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const license = await revokeLicense(req.params.id);
    res.json({ success: true, data: license });
  }),
);
