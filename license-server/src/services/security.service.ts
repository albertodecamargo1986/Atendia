import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';

// ---------- Types ----------

interface SecurityEvent {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata?: Record<string, unknown>;
  detected_at: string;
}

interface SecurityAlert {
  id: string;
  license_id: string;
  event_type: string;
  severity: string;
  description: string;
  metadata: Record<string, unknown> | null;
  detected_at: Date;
  created_at: Date;
}

type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

const SEVERITY_ORDER: Record<SeverityLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// ---------- Process Security Report ----------

export async function processSecurityReport(licenseId: string, events: SecurityEvent[]) {
  if (!events || events.length === 0) {
    return { received: true, alerts_stored: 0, max_severity: 'low' };
  }

  // Determine the max severity across all events in this report
  let maxSeverity: SeverityLevel = 'low';

  for (const event of events) {
    // Insert alert into security_alerts
    await query(
      `INSERT INTO security_alerts (id, license_id, event_type, severity, description, metadata, detected_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        uuidv4(),
        licenseId,
        event.type,
        event.severity,
        event.description,
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.detected_at,
      ],
    );

    // Track max severity
    if (SEVERITY_ORDER[event.severity] > SEVERITY_ORDER[maxSeverity]) {
      maxSeverity = event.severity;
    }

    // If critical, also flag on the license
    if (event.severity === 'critical') {
      await query(
        `UPDATE licenses SET security_flag = true WHERE id = $1`,
        [licenseId],
      );
    }
  }

  return {
    received: true,
    alerts_stored: events.length,
    max_severity: maxSeverity,
  };
}

// ---------- Detect Anomalies ----------

export async function detectAnomalies(licenseId: string, ip: string, hwid: string) {
  const anomalies: string[] = [];

  // Check 1: Multiple distinct IPs in a short window (last 2 hours)
  const ipResult = await query(
    `SELECT COUNT(DISTINCT ip) AS distinct_ips
     FROM license_events
     WHERE license_id = $1
       AND event_type = 'heartbeat'
       AND created_at >= NOW() - INTERVAL '2 hours'`,
    [licenseId],
  );

  const distinctIps = parseInt(ipResult.rows[0]?.distinct_ips ?? '0', 10);
  if (distinctIps > 3) {
    anomalies.push(`Multiple IPs detected: ${distinctIps} distinct IPs in the last 2 hours`);
  }

  // Check 2: HWID mismatch in recent events (possible cloning)
  const hwidResult = await query(
    `SELECT COUNT(DISTINCT hwid) AS distinct_hwids
     FROM license_events
     WHERE license_id = $1
       AND event_type = 'heartbeat'
       AND created_at >= NOW() - INTERVAL '24 hours'`,
    [licenseId],
  );

  const distinctHwids = parseInt(hwidResult.rows[0]?.distinct_hwids ?? '0', 10);
  if (distinctHwids > 2) {
    anomalies.push(`Multiple HWIDs detected: ${distinctHwids} distinct hardware IDs in the last 24 hours`);
  }

  // Check 3: Excessive heartbeat frequency (potential tampering)
  const freqResult = await query(
    `SELECT COUNT(*) AS beat_count
     FROM license_events
     WHERE license_id = $1
       AND event_type = 'heartbeat'
       AND created_at >= NOW() - INTERVAL '1 hour'`,
    [licenseId],
  );

  const beatCount = parseInt(freqResult.rows[0]?.beat_count ?? '0', 10);
  if (beatCount > 30) {
    anomalies.push(`Excessive heartbeat frequency: ${beatCount} heartbeats in the last hour`);
  }

  // If anomalies found, store them as security alerts
  if (anomalies.length > 0) {
    const severity: SeverityLevel = anomalies.length >= 3 ? 'high' : 'medium';

    await query(
      `INSERT INTO security_alerts (id, license_id, event_type, severity, description, metadata, detected_at, created_at)
       VALUES ($1, $2, 'anomaly', $3, $4, $5, NOW(), NOW())`,
      [
        uuidv4(),
        licenseId,
        severity,
        'Anomalous activity detected during heartbeat',
        JSON.stringify({ anomalies, ip, hwid }),
      ],
    );
  }

  return {
    has_anomalies: anomalies.length > 0,
    anomaly_count: anomalies.length,
    details: anomalies,
  };
}
