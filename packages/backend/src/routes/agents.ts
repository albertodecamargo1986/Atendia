import { Router, Request, Response } from 'express';
import * as agentService from '../services/agent.service.js';
import * as aiService from '../services/ai.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError } from '../lib/errors.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const agents = await agentService.listAgents(req.user!.tenantId);
  res.json(agents);
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const agent = await agentService.getAgent(req.user!.tenantId, req.params.id);
  res.json(agent);
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const agent = await agentService.createAgent(req.user!.tenantId, req.body);
  res.status(201).json(agent);
}));

router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const agent = await agentService.updateAgent(req.user!.tenantId, req.params.id, req.body);
  res.json(agent);
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await agentService.deleteAgent(req.user!.tenantId, req.params.id);
  res.json({ message: 'Agente deletado com sucesso' });
}));

router.post('/:id/activate', asyncHandler(async (req: Request, res: Response) => {
  const agent = await agentService.activateAgent(req.user!.tenantId, req.params.id);
  res.json(agent);
}));

router.post('/:id/deactivate', asyncHandler(async (req: Request, res: Response) => {
  const agent = await agentService.deactivateAgent(req.user!.tenantId, req.params.id);
  res.json(agent);
}));

router.post('/:id/test', asyncHandler(async (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message) throw new ValidationError('Mensagem de teste obrigatória');
  const response = await aiService.testAgent(req.params.id, req.user!.tenantId, message);
  res.json({ response });
}));

export default router;
