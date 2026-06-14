import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { tenantMiddleware } from '../middlewares/tenant.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import multer from 'multer';
import {
  listVoiceProfiles,
  getVoiceProfile,
  createVoiceProfile,
  updateVoiceProfile,
  deleteVoiceProfile,
  testVoiceProfile,
  cloneVoiceFromAudio,
} from '../services/voice-profile.service.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

const upload = multer({
  dest: 'uploads/voice-samples/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(wav|mp3|ogg|webm|m4a)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de áudio não suportado. Use WAV, MP3, OGG, WEBM ou M4A.'));
    }
  },
});

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const tenantId = (_req as any).tenantId;
  const profiles = await listVoiceProfiles(tenantId);
  res.json({ success: true, data: profiles });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const profile = await getVoiceProfile(tenantId, req.params.id);
  res.json({ success: true, data: profile });
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const profile = await createVoiceProfile(tenantId, req.body);
  res.status(201).json({ success: true, data: profile });
}));

router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const profile = await updateVoiceProfile(tenantId, req.params.id, req.body);
  res.json({ success: true, data: profile });
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  await deleteVoiceProfile(tenantId, req.params.id);
  res.json({ success: true });
}));

router.post('/:id/test', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const audioUrl = await testVoiceProfile(tenantId, req.params.id);
  res.json({ success: true, audioUrl });
}));

// Clone voice from uploaded audio samples via ElevenLabs
router.post('/clone', upload.array('files', 5), asyncHandler(async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const files = req.files as Express.Multer.File[];
  const name = req.body.name as string;

  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, error: 'Envie pelo menos 1 arquivo de áudio' });
  }
  if (!name) {
    return res.status(400).json({ success: false, error: 'Nome da voz é obrigatório' });
  }

  const result = await cloneVoiceFromAudio(tenantId, name, files);
  res.status(201).json({ success: true, data: result });
}));

export default router;
