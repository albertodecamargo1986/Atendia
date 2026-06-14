import { Router, Request, Response } from 'express';
import * as contactService from '../services/contact.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const result = await contactService.listContacts(req.user!.tenantId, {
    search: req.query.search as string | undefined,
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
  });
  res.json(result);
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const contact = await contactService.getContact(req.user!.tenantId, req.params.id);
  res.json(contact);
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const contact = await contactService.createContact(req.user!.tenantId, req.body);
  res.status(201).json(contact);
}));

router.post('/quick-save/:conversationId', asyncHandler(async (req: Request, res: Response) => {
  const contact = await contactService.quickSaveFromConversation(
    req.user!.tenantId,
    req.params.conversationId,
    req.body,
  );
  res.status(201).json(contact);
}));

router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const contact = await contactService.updateContact(req.user!.tenantId, req.params.id, req.body);
  res.json(contact);
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await contactService.deleteContact(req.user!.tenantId, req.params.id);
  res.json({ ok: true });
}));

export default router;
