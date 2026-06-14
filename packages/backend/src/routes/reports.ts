import { Router, Request, Response } from 'express';
import * as reportService from '../services/report.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.get('/data', asyncHandler(async (req: Request, res: Response) => {
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const result = await reportService.getReportData(req.user!.tenantId, startDate, endDate, page, limit);
  res.json(result);
}));

router.get('/export', asyncHandler(async (req: Request, res: Response) => {
  const type = (req.query.type as string) || 'tickets';
  if (!['tickets', 'conversations', 'ratings'].includes(type)) {
    res.status(400).json({ error: 'Invalid export type' });
    return;
  }
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

  res.header('Content-Type', 'text/csv');
  res.header('Content-Disposition', `attachment; filename="${type}-report-${new Date().toISOString().slice(0, 10)}.csv"`);

  const stream = reportService.streamCSV(req.user!.tenantId, type as any, startDate, endDate);
  stream.pipe(res);
}));

export default router;
