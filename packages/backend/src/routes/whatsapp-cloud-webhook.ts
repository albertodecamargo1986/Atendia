import { Router, Request, Response } from 'express';

import * as cloudService from '../services/whatsapp-cloud.service.js';
import { asyncHandler } from '../middlewares/async-handler.js';

/**
 * Webhook PÚBLICO da API oficial do WhatsApp (sem login): a Meta chama
 *   GET  /api/whatsapp/cloud/webhook/:sessionId  → verificação (hub.challenge)
 *   POST /api/whatsapp/cloud/webhook/:sessionId  → eventos (assinatura X-Hub-Signature-256)
 * Montado ANTES do router autenticado de /whatsapp, com rate limit próprio.
 */
const router = Router();

router.get('/:sessionId', asyncHandler(async (req: Request, res: Response) => {
  const challenge = await cloudService.verifyWebhook(req.params.sessionId, req.query as Record<string, unknown>);
  if (challenge === null) {
    res.status(403).type('text/plain').send('Forbidden');
    return;
  }
  res.status(200).type('text/plain').send(challenge);
}));

router.post('/:sessionId', asyncHandler(async (req: Request, res: Response) => {
  const result = await cloudService.receiveWebhook(
    req.params.sessionId,
    (req as any).rawBody,
    req.get('x-hub-signature-256'),
    req.body,
  );
  if (result === 'not_found') {
    res.status(404).json({ success: false });
    return;
  }
  if (result === 'invalid_signature') {
    res.status(403).json({ success: false });
    return;
  }
  // 200 rápido: o processamento acontece na fila (whatsapp-cloud-webhook)
  res.status(200).json({ success: true });
}));

export default router;
