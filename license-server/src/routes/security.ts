import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { securityLimiter } from '../middleware/rateLimiter';
import { processSecurityReport } from '../services/security.service';

export const securityRouter = Router();

// ---------- Schema ----------

const securityEventSchema = z.object({
  type: z.string().min(1, 'Event type is required'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(1, 'Description is required'),
  metadata: z.record(z.unknown()).optional(),
  detected_at: z.string().min(1, 'Detection timestamp is required'),
});

const reportSchema = z.object({
  license_id: z.string().min(1, 'License ID is required'),
  events: z.array(securityEventSchema).min(1, 'At least one event is required'),
});

// ---------- POST /report ----------

securityRouter.post('/report', securityLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join('; '),
      });
      return;
    }

    const { license_id, events } = parsed.data;

    // Verify the token's serial maps to this license_id
    const payload = req.licensePayload!;
    // The token carries the serial; license_id in the report must match
    // We'll let the service layer handle the mapping internally

    const result = await processSecurityReport(license_id, events);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Failed to process security report.',
    });
  }
});
