import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middlewares/async-handler.js';
import { NotFoundError } from '../lib/errors.js';

const router = Router();

const DOWNLOAD_URLS: Record<string, string> = {
  win: process.env.DOWNLOAD_URL_WIN || 'https://github.com/atendia/atendia/releases/latest/download/AtendIA-Setup.exe',
  mac: process.env.DOWNLOAD_URL_MAC || 'https://github.com/atendia/atendia/releases/latest/download/AtendIA.dmg',
  linux: process.env.DOWNLOAD_URL_LINUX || 'https://github.com/atendia/atendia/releases/latest/download/AtendIA.AppImage',
};

const LATEST_VERSION = process.env.APP_VERSION || '1.0.0';

router.get('/latest', asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    version: LATEST_VERSION,
    platforms: {
      win: { label: 'Windows (.exe)', url: DOWNLOAD_URLS.win },
      mac: { label: 'macOS (.dmg)', url: DOWNLOAD_URLS.mac },
      linux: { label: 'Linux (.AppImage)', url: DOWNLOAD_URLS.linux },
    },
  });
}));

router.get('/:platform', asyncHandler(async (req: Request, res: Response) => {
  const { platform } = req.params;
  const url = DOWNLOAD_URLS[platform];
  if (!url) throw new NotFoundError('Plataforma', platform);
  res.redirect(url);
}));

export default router;
