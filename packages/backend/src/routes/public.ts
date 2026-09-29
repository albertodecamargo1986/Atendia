import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { PLANS, type PlanId } from '../config/plans.js';

/**
 * Rotas públicas (sem autenticação) — montadas em /api/public.
 */
const router = Router();

const PLAN_ORDER: PlanId[] = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'];
const HIGHLIGHTED: PlanId = 'PRO';

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

// GET /api/public/plans — planos ativos (tabela PlanConfig; fallback: config/plans.ts)
router.get('/plans', asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.planConfig.findMany({ where: { isActive: true } });

  const plans = rows.length > 0
    ? rows.map((p) => ({
        id: p.id,
        key: p.planId,
        name: p.name,
        description: p.description,
        priceMonthly: p.price,
        features: toStringArray(p.features),
        limits: (p.limits ?? {}) as Record<string, unknown>,
        highlighted: p.planId === HIGHLIGHTED,
      }))
    : PLAN_ORDER.map((key) => ({
        id: key,
        key,
        name: PLANS[key].name,
        description: '',
        priceMonthly: PLANS[key].price,
        features: PLANS[key].features.includes('*') ? ['Todos os módulos'] : PLANS[key].features,
        limits: PLANS[key].limits as Record<string, unknown>,
        highlighted: key === HIGHLIGHTED,
      }));

  plans.sort((a, b) => PLAN_ORDER.indexOf(a.key as PlanId) - PLAN_ORDER.indexOf(b.key as PlanId));
  res.set('Cache-Control', 'public, max-age=300');
  res.json(plans);
}));

export default router;
