import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { strictLimiter, moderateLimiter } from '../middleware/rateLimiter';
import {
  activateLicense,
  validateLicense,
  recordHeartbeat,
  transferLicense,
} from '../services/license.service';
import { detectAnomalies } from '../services/security.service';
import { query } from '../config/database';

export const licenseRouter = Router();

// ---------- Schemas ----------

const activateSchema = z.object({
  serial: z.string().min(1, 'Serial is required'),
  hwid: z.string().min(1, 'Hardware ID is required'),
});

const validateSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  hwid: z.string().min(1, 'Hardware ID is required'),
});

const heartbeatSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  hwid: z.string().min(1, 'Hardware ID is required'),
  ip: z.string().min(1, 'IP address is required'),
});

const transferSchema = z.object({
  serial: z.string().min(1, 'Serial is required'),
  hwid: z.string().min(1, 'New hardware ID is required'),
  transfer_token: z.string().min(1, 'Transfer token is required'),
});

// ---------- POST /activate ----------

licenseRouter.post('/activate', strictLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = activateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join('; '),
      });
      return;
    }

    const { serial, hwid } = parsed.data;
    const result = await activateLicense(serial, hwid);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Activation failed.',
    });
  }
});

// ---------- POST /validate ----------

licenseRouter.post('/validate', moderateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = validateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join('; '),
      });
      return;
    }

    const { token, hwid } = parsed.data;
    const result = await validateLicense(token, hwid);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Validation failed.',
    });
  }
});

// ---------- POST /heartbeat ----------

licenseRouter.post('/heartbeat', moderateLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join('; '),
      });
      return;
    }

    const { hwid, ip } = parsed.data;
    const payload = req.licensePayload!;

    // Resolve license_id from serial
    const licenseResult = await query(
      'SELECT id FROM licenses WHERE serial = $1',
      [payload.sub],
    );

    if (licenseResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'License not found.',
      });
      return;
    }

    const licenseId = licenseResult.rows[0].id;

    // Record the heartbeat
    const heartbeatResult = await recordHeartbeat(licenseId, hwid, ip);

    // Run anomaly detection
    const anomalyResult = await detectAnomalies(licenseId, ip, hwid);

    res.status(200).json({
      success: true,
      data: {
        ...heartbeatResult,
        anomaly_detected: anomalyResult.has_anomalies,
      },
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Heartbeat processing failed.',
    });
  }
});

// ---------- POST /transfer ----------

licenseRouter.post('/transfer', strictLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join('; '),
      });
      return;
    }

    const { serial, hwid, transfer_token } = parsed.data;
    const result = await transferLicense(serial, hwid, transfer_token);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Transfer failed.',
    });
  }
});
