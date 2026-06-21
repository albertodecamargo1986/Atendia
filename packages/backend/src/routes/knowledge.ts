import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import * as knowledgeService from '../services/knowledge.service.js';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { requireModule } from '../middlewares/feature-gate.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError } from '../lib/errors.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const KNOWLEDGE_UPLOAD_PATH = path.join(process.cwd(), UPLOAD_DIR, 'knowledge');

// Ensure upload directory exists at module load (async, one-time)
fs.mkdir(KNOWLEDGE_UPLOAD_PATH, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, KNOWLEDGE_UPLOAD_PATH);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
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
      cb(new Error(`Tipo não suportado: ${ext}. Use PDF, TXT, MD ou CSV.`));
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

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const kb = await knowledgeService.getKnowledge(req.user!.tenantId, req.params.id);
  res.json(kb);
}));

router.post('/', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
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

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await knowledgeService.deleteKnowledge(req.user!.tenantId, req.params.id);
  res.json({ message: 'Base de conhecimento deletada com sucesso' });
}));

export default router;
