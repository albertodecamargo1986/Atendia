import { Router, Request, Response } from 'express';
import * as userService from '../services/user.service.js';
import { authMiddleware, requireRole } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.get('/', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const users = await userService.listUsers(req.user!.tenantId);
  res.json(users);
}));

router.get('/stats', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const stats = await userService.getTeamStats(req.user!.tenantId);
  res.json(stats);
}));

router.patch('/profile/me', asyncHandler(async (req: Request, res: Response) => {
  const { name, currentPassword, newPassword } = req.body;
  const user = await userService.updateProfile(req.user!.sub, req.user!.tenantId, { name, currentPassword, newPassword });
  res.json(user);
}));

router.get('/:id', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getUser(req.user!.tenantId, req.params.id);
  res.json(user);
}));

router.post('/', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.createUser(req.user!.tenantId, req.body, req.user!.sub);
  res.status(201).json(user);
}));

router.patch('/:id', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.updateUser(req.user!.tenantId, req.params.id, req.body, req.user!.sub);
  res.json(user);
}));

router.post('/:id/toggle-active', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.toggleUserActive(req.user!.tenantId, req.params.id, req.user!.sub);
  res.json(user);
}));

router.delete('/:id', requireRole('OWNER'), asyncHandler(async (req: Request, res: Response) => {
  await userService.deleteUser(req.user!.tenantId, req.params.id, req.user!.sub);
  res.json({ message: 'Usuário removido com sucesso' });
}));

export default router;
