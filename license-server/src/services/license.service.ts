import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import { env } from '../config/env';
import { signToken, verifyToken, TokenPayload } from '../utils/jwt';
import { isSameMachine } from '../utils/hwid';

// ---------- Types ----------

interface LicenseRow {
  id: string;
  serial: string;
  plan: string;
  status: string;
  expires_at: Date;
  hwid: string | null;
  transfer_count: number;
  last_transferred_at: Date | null;
  created_at: Date;
  revoked_at: Date | null;
}

interface HeartbeatRow {
  id: string;
  license_id: string;
  hwid: string;
  ip: string;
  event_type: string;
  created_at: Date;
}

// ---------- Helpers ----------

/**
 * Generate a serial key in the format ATND-XXXX-XXXX-XXXX-XXXX
 * Each X is an uppercase alphanumeric character.
 */
export function generateSerial(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes confusing 0/O, 1/I
  const segments: string[] = [];

  for (let s = 0; s < 4; s++) {
    let segment = '';
    for (let i = 0; i < 4; i++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(segment);
  }

  return `ATND-${segments.join('-')}`;
}

// ---------- Activate ----------

export async function activateLicense(serial: string, hwid: string) {
  // 1. Look up the license by serial
  const result = await query(
    'SELECT * FROM licenses WHERE serial = $1',
    [serial],
  );

  if (result.rows.length === 0) {
    throw Object.assign(new Error('Serial key not found.'), { statusCode: 404 });
  }

  const license: LicenseRow = result.rows[0];

  // 2. Check not expired
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    throw Object.assign(new Error('License has expired.'), { statusCode: 403 });
  }

  // 3. Check not revoked
  if (license.status === 'revoked') {
    throw Object.assign(new Error('License has been revoked.'), { statusCode: 403 });
  }

  // 4. If already activated on the same machine, just reissue token
  if (license.hwid && isSameMachine(license.hwid, hwid)) {
    const token = signToken({
      serial: license.serial,
      hwid,
      plan: license.plan,
    });

    await query(
      'UPDATE licenses SET hwid = $1, status = $2 WHERE id = $3',
      [hwid, 'active', license.id],
    );

    return {
      token,
      plan: license.plan,
      expires_at: license.expires_at,
      status: 'active',
    };
  }

  // 5. If already activated on a different machine, check transfer eligibility
  if (license.hwid && !isSameMachine(license.hwid, hwid)) {
    const eligible = await checkTransferEligibility(license.id);
    if (!eligible.allowed) {
      throw Object.assign(
        new Error(`Transfer limit reached. ${eligible.reason}`),
        { statusCode: 403 },
      );
    }

    // Execute transfer
    await query(
      `UPDATE licenses
         SET hwid = $1,
             transfer_count = transfer_count + 1,
             last_transferred_at = NOW(),
             status = 'active'
       WHERE id = $2`,
      [hwid, license.id],
    );

    // Log transfer event
    await query(
      `INSERT INTO license_events (id, license_id, hwid, ip, event_type, created_at)
       VALUES ($1, $2, $3, $4, 'transfer', NOW())`,
      [uuidv4(), license.id, hwid, ''],
    );
  } else {
    // 6. First activation
    await query(
      `UPDATE licenses
         SET hwid = $1, status = 'active', activated_at = COALESCE(activated_at, NOW())
       WHERE id = $2`,
      [hwid, license.id],
    );

    // Log activation event
    await query(
      `INSERT INTO license_events (id, license_id, hwid, ip, event_type, created_at)
       VALUES ($1, $2, $3, $4, 'activate', NOW())`,
      [uuidv4(), license.id, hwid, ''],
    );
  }

  // 7. Generate JWT
  const token = signToken({
    serial: license.serial,
    hwid,
    plan: license.plan,
  });

  // Fetch updated row for accurate expires_at
  const updated = await query('SELECT expires_at FROM licenses WHERE id = $1', [license.id]);

  return {
    token,
    plan: license.plan,
    expires_at: updated.rows[0].expires_at,
    status: 'active',
  };
}

// ---------- Validate ----------

export async function validateLicense(token: string, hwid: string) {
  // 1. Verify JWT signature and expiration
  let payload: TokenPayload;
  try {
    payload = verifyToken(token);
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw Object.assign(new Error('Token expired.'), { statusCode: 401 });
    }
    throw Object.assign(new Error('Invalid token.'), { statusCode: 401 });
  }

  // 2. Check HWID matches
  if (!isSameMachine(payload.hwid, hwid)) {
    throw Object.assign(new Error('Hardware ID mismatch. Use /transfer to migrate.'), {
      statusCode: 403,
    });
  }

  // 3. Look up license in DB and check revocation
  const result = await query(
    'SELECT status, plan, expires_at FROM licenses WHERE serial = $1',
    [payload.sub],
  );

  if (result.rows.length === 0) {
    throw Object.assign(new Error('License not found.'), { statusCode: 404 });
  }

  const license = result.rows[0];

  if (license.status === 'revoked') {
    throw Object.assign(new Error('License has been revoked.'), { statusCode: 403 });
  }

  // 4. Check expiration
  const now = new Date();
  const expiresAt = new Date(license.expires_at);
  const isExpired = expiresAt < now;

  // 5. Check offline tolerance
  const lastHeartbeat = await query(
    `SELECT created_at FROM license_events
     WHERE license_id = (SELECT id FROM licenses WHERE serial = $1)
       AND event_type = 'heartbeat'
     ORDER BY created_at DESC LIMIT 1`,
    [payload.sub],
  );

  let offlineTooLong = false;
  if (lastHeartbeat.rows.length > 0) {
    const lastSeen = new Date(lastHeartbeat.rows[0].created_at);
    const offlineDays = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24);
    if (offlineDays > env.OFFLINE_TOLERANCE_DAYS) {
      offlineTooLong = true;
    }
  }

  const valid = !isExpired && !offlineTooLong && license.status !== 'revoked';

  return {
    valid,
    plan: license.plan,
    expires_at: license.expires_at,
    status: valid ? 'active' : (isExpired ? 'expired' : offlineTooLong ? 'offline_exceeded' : license.status),
  };
}

// ---------- Heartbeat ----------

export async function recordHeartbeat(licenseId: string, hwid: string, ip: string) {
  // Insert heartbeat event
  await query(
    `INSERT INTO license_events (id, license_id, hwid, ip, event_type, created_at)
     VALUES ($1, $2, $3, $4, 'heartbeat', NOW())`,
    [uuidv4(), licenseId, hwid, ip],
  );

  // Update last_seen_at on license
  await query(
    'UPDATE licenses SET last_seen_at = NOW() WHERE id = $1',
    [licenseId],
  );

  // Compute next heartbeat time
  const nextHeartbeatAt = new Date(Date.now() + env.HEARTBEAT_INTERVAL_MS);

  return {
    received: true,
    next_heartbeat_at: nextHeartbeatAt.toISOString(),
  };
}

// ---------- Transfer ----------

export async function checkTransferEligibility(licenseId: string) {
  const result = await query(
    'SELECT transfer_count, last_transferred_at FROM licenses WHERE id = $1',
    [licenseId],
  );

  if (result.rows.length === 0) {
    return { allowed: false, reason: 'License not found.' };
  }

  const license = result.rows[0];

  // Count transfers within the last 12 months
  const yearlyResult = await query(
    `SELECT COUNT(*) AS cnt
     FROM license_events
     WHERE license_id = $1
       AND event_type = 'transfer'
       AND created_at >= NOW() - INTERVAL '12 months'`,
    [licenseId],
  );

  const yearlyTransfers = parseInt(yearlyResult.rows[0].cnt, 10);

  if (yearlyTransfers >= env.TRANSFER_LIMIT_PER_YEAR) {
    return {
      allowed: false,
      reason: `Maximum ${env.TRANSFER_LIMIT_PER_YEAR} transfers per year already used.`,
    };
  }

  return {
    allowed: true,
    remaining: env.TRANSFER_LIMIT_PER_YEAR - yearlyTransfers,
    reason: null,
  };
}

export async function transferLicense(serial: string, hwid: string, transferToken: string) {
  // 1. Verify the transfer token (which is a JWT with a specific claim)
  let payload: TokenPayload;
  try {
    payload = verifyToken(transferToken);
  } catch {
    throw Object.assign(new Error('Invalid or expired transfer token.'), { statusCode: 401 });
  }

  // 2. Verify the serial matches the token
  if (payload.sub !== serial) {
    throw Object.assign(new Error('Transfer token does not match this serial.'), { statusCode: 403 });
  }

  // 3. Look up license
  const result = await query(
    'SELECT id, hwid, status, plan, expires_at FROM licenses WHERE serial = $1',
    [serial],
  );

  if (result.rows.length === 0) {
    throw Object.assign(new Error('License not found.'), { statusCode: 404 });
  }

  const license = result.rows[0] as LicenseRow;

  if (license.status === 'revoked') {
    throw Object.assign(new Error('License has been revoked.'), { statusCode: 403 });
  }

  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    throw Object.assign(new Error('License has expired.'), { statusCode: 403 });
  }

  // 4. Check transfer eligibility
  const eligible = await checkTransferEligibility(license.id);
  if (!eligible.allowed) {
    throw Object.assign(new Error(eligible.reason || 'Transfer not allowed.'), { statusCode: 403 });
  }

  // 5. Execute the transfer
  await query(
    `UPDATE licenses
       SET hwid = $1,
           transfer_count = transfer_count + 1,
           last_transferred_at = NOW()
     WHERE id = $2`,
    [hwid, license.id],
  );

  // Log the event
  await query(
    `INSERT INTO license_events (id, license_id, hwid, ip, event_type, created_at)
     VALUES ($1, $2, $3, $4, 'transfer', NOW())`,
    [uuidv4(), license.id, hwid, ''],
  );

  // 6. Issue a new JWT with the new HWID
  const newToken = signToken({
    serial,
    hwid,
    plan: license.plan,
  });

  return {
    token: newToken,
    plan: license.plan,
    expires_at: license.expires_at,
    status: 'active',
  };
}
