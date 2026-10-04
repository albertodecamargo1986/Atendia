import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import * as knowledgeService from '../services/knowledge.service.js';
import { authMiddleware, requireTenantAdmin } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { requireModule } from '../middlewares/feature-gate.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError, uploadFilterError } from '../lib/errors.js';
import { tenantUploadDir, sanitizeFilename } from '../lib/uploads.js';

const storage = multer.diskStorage({
  // UPLOAD_DIR/<tenantId>/knowledge/ (config.UPLOAD_DIR — nunca caminho fixo)
  destination: (req, _file, cb) => {
    try {
      cb(null, tenantUploadDir(req.user!.tenantId, 'knowledge'));
    } catch (err: any) {
      cb(err, '');
    }
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    cb(null, `${uniqueSuffix}-${sanitizeFilename(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10) },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.md', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(uploadFilterError(`Tipo não suportado: ${ext}. Use PDF, TXT, MD ou CSV.`));
    }
  },
});

const router = Router();
router.use(authMiddleware, tenantMiddleware, requireModule('knowledge'));

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const knowledge = await knowledgeService.listKnowledge(
    req.user!.tenantId,
    req.query.agentId as string | undefined
  );
  res.json(knowledge);
}));

router.post('/', requireTenantAdmin, upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (req.file) {
    const agentId = req.body.agentId;
    if (!agentId) throw new ValidationError('agentId é obrigatório');
    const kb = await knowledgeService.createKnowledgeFromFile(
      req.user!.tenantId,
      agentId,
      req.file
    );
    res.status(201).json(kb);
  } else {
    const kb = await knowledgeService.createKnowledge(req.user!.tenantId, req.body);
    res.status(201).json(kb);
  }
}));

router.delete('/:id', requireTenantAdmin, asyncHandler(async (req: Request, res: Response) => {
  await knowledgeService.deleteKnowledge(req.user!.tenantId, req.params.id);
  res.json({ message: 'Base de conhecimento deletada com sucesso' });
}));

export default router;
