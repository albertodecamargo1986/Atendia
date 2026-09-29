import { Router, Request, Response } from 'express';
import * as agentService from '../services/agent.service.js';
import * as aiService from '../services/ai.service.js';
import { authMiddleware, requireTenantAdmin } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError } from '../lib/errors.js';
import { AGENT_TEMPLATES } from '../config/agent-templates.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const agents = await agentService.listAgents(req.user!.tenantId);
  res.json(agents);
}));

// Modelos prontos (Loja / Clínica / Suporte / Genérico) — antes de /:id
router.get('/templates', (_req: Request, res: Response) => {
  res.json(AGENT_TEMPLATES.map(({ key, name, description, systemPrompt, greeting, toneOfVoice, temperature }) => ({
    key, name, description, systemPrompt, greeting, toneOfVoice, temperature,
  })));
});

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const agent = await agentService.getAgent(req.user!.tenantId, req.params.id);
  res.json(agent);
}));

router.post('/', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const agent = await agentService.createAgent(req.user!.tenantId, req.body);
  res.status(201).json(agent);
}));

router.put('/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const agent = await agentService.updateAgent(req.user!.tenantId, req.params.id, req.body);
  res.json(agent);
}));

router.delete('/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  await agentService.deleteAgent(req.user!.tenantId, req.params.id);
  res.json({ message: 'Agente excluído com sucesso' });
}));

router.post('/:id/activate', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const agent = await agentService.activateAgent(req.user!.tenantId, req.params.id);
  res.json(agent);
}));

router.post('/:id/deactivate', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  const agent = await agentService.deactivateAgent(req.user!.tenantId, req.params.id);
  res.json(agent);
}));

// Testar NÃO ativa o agente (funciona com rascunho/inativo)
router.post('/:id/test', asyncHandler(async (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message) throw new ValidationError('Mensagem de teste obrigatória');
  const response = await aiService.testAgent(req.params.id, req.user!.tenantId, String(message));
  res.json({ response });
}));

export default router;
