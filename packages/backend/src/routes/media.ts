import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { ValidationError } from '../lib/errors.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

const ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|mp4|mp3|ogg|wav|pdf|doc|docx|xls|xlsx|txt|csv)$/i;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);

const MIME_MAP: Record<string, string[]> = {
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  VIDEO: ['video/mp4'],
  AUDIO: ['audio/mpeg', 'audio/ogg', 'audio/wav'],
  DOCUMENT: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
  ],
};

const ALL_ALLOWED_MIMES = Object.values(MIME_MAP).flat();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_EXTENSIONS.test(path.extname(file.originalname || ''))) {
      cb(new Error('Tipo de arquivo nao suportado'));
      return;
    }
    if (file.mimetype && !ALL_ALLOWED_MIMES.includes(file.mimetype)) {
      cb(new Error('Tipo MIME nao suportado'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();
router.use(authMiddleware, tenantMiddleware);

router.post('/', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ValidationError('Nenhum arquivo enviado');

  const ext = path.extname(req.file.originalname || '').toLowerCase();
  let mediaType = 'DOCUMENT';
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(ext)) mediaType = 'IMAGE';
  else if (/\.(mp4)$/i.test(ext)) mediaType = 'VIDEO';
  else if (/\.(mp3|ogg|wav)$/i.test(ext)) mediaType = 'AUDIO';

  // Validate magic bytes for dangerous file types
  const DANGEROUS_SIGNATURES = [
    Buffer.from([0x4D, 0x5A]),       // MZ — DOS/Windows executable
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // PK — could be jar/zip with executable
    Buffer.from([0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]), // <script — HTML/JS
    Buffer.from([0x3C, 0x68, 0x74, 0x6D, 0x6C]), // <html — HTML
  ];

  try {
    const fd = fs.openSync(req.file.path, 'r');
    const header = Buffer.alloc(8);
    fs.readSync(fd, header, 0, 8, 0);
    fs.closeSync(fd);

    for (const sig of DANGEROUS_SIGNATURES) {
      if (header.subarray(0, sig.length).equals(sig)) {
        fs.unlinkSync(req.file.path);
        throw new ValidationError('Arquivo contém conteúdo potencialmente perigoso');
      }
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    // If we can't read the file, continue — it will fail on use
  }

  const mediaUrl = `/uploads/${req.file.filename}`;

  res.status(201).json({
    mediaUrl,
    mediaType,
    originalName: req.file.originalname,
    size: req.file.size,
  });
}));

export default router;
