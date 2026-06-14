import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middlewares/async-handler.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import prisma from '../lib/prisma.js';

const router = Router();

const DOWNLOAD_URLS: Record<string, string> = {
  win: process.env.DOWNLOAD_URL_WIN || 'https://github.com/atendia/atendia/releases/latest/download/AtendIA-Setup.exe',
  mac: process.env.DOWNLOAD_URL_MAC || 'https://github.com/atendia/atendia/releases/latest/download/AtendIA.dmg',
  linux: process.env.DOWNLOAD_URL_LINUX || 'https://github.com/atendia/atendia/releases/latest/download/AtendIA.AppImage',
};

const LATEST_VERSION = process.env.APP_VERSION || '1.0.0';

async function verifySerial(serial: string): Promise<{ valid: boolean; licenseId?: string }> {
  const license = await prisma.license.findFirst({
    where: { serial, status: { in: ['ACTIVE', 'INACTIVE'] } },
  });
  if (!license) return { valid: false };
  return { valid: true, licenseId: license.id };
}

// GET /download/latest — version info + available platforms
router.get('/latest', asyncHandler(async (req: Request, res: Response) => {
  const serial = (req.query.serial as string) || '';

  let isAuthorized = false;
  if (serial) {
    try {
      const result = await verifySerial(serial);
      isAuthorized = result.valid;
    } catch {
      isAuthorized = false;
    }
  }

  res.json({
    version: LATEST_VERSION,
    authorized: isAuthorized,
    platforms: {
      win: { label: 'Windows (.exe)', url: DOWNLOAD_URLS.win },
      mac: { label: 'macOS (.dmg)', url: DOWNLOAD_URLS.mac },
      linux: { label: 'Linux (.AppImage)', url: DOWNLOAD_URLS.linux },
    },
  });
}));

// GET /download/:platform — redirect to install URL (requires valid serial)
router.get('/:platform', asyncHandler(async (req: Request, res: Response) => {
  const { platform } = req.params;
  const serial = (req.query.serial as string) || '';

  const url = DOWNLOAD_URLS[platform];
  if (!url) {
    throw new NotFoundError('Plataforma', platform);
  }

  if (!serial) {
    throw new ForbiddenError('Serial é obrigatório para download. Forneça ?serial=ATND-XXXX-XXXX-XXXX-XXXX');
  }

  let licenseId: string | undefined;
  try {
    const result = await verifySerial(serial);
    if (!result.valid) {
      throw new ForbiddenError('Serial inválido ou licença não está ativa');
    }
    licenseId = result.licenseId;
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    throw new ForbiddenError('Erro ao verificar serial');
  }

  try {
    if (licenseId) {
      await prisma.licenseEvent.create({
        data: {
          licenseId,
          eventType: 'ACTIVATE',
          ip: req.ip,
        },
      });
    }
  } catch {
    // Don't block download if logging fails
  }

  res.redirect(url);
}));

export default router;
