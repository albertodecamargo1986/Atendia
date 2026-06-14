import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { isSameMachine } from '../lib/hwid.js';
import { NotFoundError, ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { getConfig } from '../config/index.js';

const SERIAL_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateSerial(): string {
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let segment = '';
    for (let i = 0; i < 4; i++) {
      segment += SERIAL_CHARS[crypto.randomInt(0, SERIAL_CHARS.length)];
    }
    segments.push(segment);
  }
  return `ATND-${segments.join('-')}`;
}

export async function ensureUniqueSerial(): Promise<string> {
  let serial = generateSerial();
  let exists = true;
  while (exists) {
    const found = await prisma.license.findUnique({ where: { serial } });
    if (!found) {
      exists = false;
    } else {
      serial = generateSerial();
    }
  }
  return serial;
}

// Lazy-access config to avoid reading process.env directly
function getLicenseConfig() {
  const config = getConfig();
  return {
    JWT_SECRET: config.LICENSE_JWT_SECRET || config.JWT_SECRET,
    JWT_EXPIRES: config.LICENSE_JWT_EXPIRES_IN,
    OFFLINE_TOLERANCE_DAYS: config.OFFLINE_TOLERANCE_DAYS,
    TRANSFER_LIMIT_PER_YEAR: config.TRANSFER_LIMIT_PER_YEAR,
  };
}

interface LicenseTokenPayload {
  sub: string;
  hwid: string;
  plan: string;
  exp?: number;
  iat?: number;
  iss?: string;
}

function signLicenseToken(data: { serial: string; hwid: string; plan: string }): string {
  const cfg = getLicenseConfig();
  const payload: LicenseTokenPayload = { sub: data.serial, hwid: data.hwid, plan: data.plan, iss: 'atend-ia' };
  return jwt.sign(
    payload,
    cfg.JWT_SECRET,
    { expiresIn: cfg.JWT_EXPIRES as any },
  );
}

export function verifyLicenseToken(token: string): LicenseTokenPayload {
  const cfg = getLicenseConfig();
  return jwt.verify(token, cfg.JWT_SECRET, { issuer: 'atend-ia' }) as LicenseTokenPayload;
}

// ---------- Activate ----------

export async function activateLicense(serial: string, hwid: string) {
  const license = await prisma.license.findUnique({ where: { serial } });

  if (!license) {
    throw new NotFoundError('Serial', serial);
  }

  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    throw new ForbiddenError('Licença expirada.');
  }

  if (license.status === 'REVOKED') {
    throw new ForbiddenError('Licença revogada.');
  }

  // Same machine — reissue token
  if (license.hwid && isSameMachine(license.hwid, hwid)) {
    const token = signLicenseToken({ serial: license.serial, hwid, plan: license.plan as string });

    await prisma.license.update({
      where: { id: license.id },
      data: { hwid, status: 'ACTIVE', activatedAt: license.activatedAt ?? new Date() },
    });

    await prisma.licenseEvent.create({
      data: { licenseId: license.id, hwid, eventType: 'ACTIVATE' },
    });

    return { token, plan: license.plan, expiresAt: license.expiresAt, status: 'ACTIVE' };
  }

  // Different machine — check transfer
  if (license.hwid && !isSameMachine(license.hwid, hwid)) {
    const eligible = await checkTransferEligibility(license.id);
    if (!eligible.allowed) {
      throw new ForbiddenError(`Limite de transferência atingido. ${eligible.reason}`);
    }

    await prisma.license.update({
      where: { id: license.id },
      data: {
        hwid,
        transferCount: { increment: 1 },
        lastTransferredAt: new Date(),
        status: 'ACTIVE',
      },
    });

    await prisma.licenseEvent.create({
      data: { licenseId: license.id, hwid, eventType: 'TRANSFER' },
    });
  } else {
    // First activation
    await prisma.license.update({
      where: { id: license.id },
      data: { hwid, status: 'ACTIVE', activatedAt: new Date() },
    });

    await prisma.licenseEvent.create({
      data: { licenseId: license.id, hwid, eventType: 'ACTIVATE' },
    });
  }

  const token = signLicenseToken({ serial: license.serial, hwid, plan: license.plan });
  const updated = await prisma.license.findUnique({ where: { id: license.id } });

  return { token, plan: license.plan, expiresAt: updated?.expiresAt ?? null, status: 'ACTIVE' };
}

// ---------- Validate ----------

export async function validateLicense(token: string, hwid: string) {
  let payload: LicenseTokenPayload;
  try {
    payload = verifyLicenseToken(token);
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Token expirado.');
    }
    throw new UnauthorizedError('Token inválido.');
  }

  if (!isSameMachine(payload.hwid, hwid)) {
    throw new ForbiddenError('Hardware ID não confere. Use /transfer para migrar.');
  }

  const license = await prisma.license.findUnique({ where: { serial: payload.sub } });

  if (!license) {
    throw new NotFoundError('Licença', payload.sub);
  }

  if (license.status === 'REVOKED') {
    throw new ForbiddenError('Licença revogada.');
  }

  const isExpired = license.expiresAt ? new Date(license.expiresAt) < new Date() : false;

  // Check offline tolerance
  let offlineTooLong = false;
  const lastHeartbeat = await prisma.licenseEvent.findFirst({
    where: { licenseId: license.id, eventType: 'HEARTBEAT' },
    orderBy: { createdAt: 'desc' },
  });

  if (lastHeartbeat) {
    const offlineDays = (Date.now() - lastHeartbeat.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (offlineDays > getLicenseConfig().OFFLINE_TOLERANCE_DAYS) {
      offlineTooLong = true;
    }
  }

  const valid = !isExpired && !offlineTooLong;

  return {
    valid,
    plan: license.plan,
    expiresAt: license.expiresAt,
    status: valid ? 'ACTIVE' : (isExpired ? 'EXPIRED' : offlineTooLong ? 'EXPIRED' : license.status),
  };
}

// ---------- Heartbeat ----------

export async function recordHeartbeat(licenseId: string, hwid: string, ip: string) {
  await prisma.licenseEvent.create({
    data: { licenseId, hwid, ip, eventType: 'HEARTBEAT' },
  });

  await prisma.license.update({
    where: { id: licenseId },
    data: { lastSeenAt: new Date() },
  });

  const nextHeartbeatAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4h

  return { received: true, nextHeartbeatAt: nextHeartbeatAt.toISOString() };
}

// ---------- Transfer ----------

export async function checkTransferEligibility(licenseId: string) {
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  const yearlyTransfers = await prisma.licenseEvent.count({
    where: {
      licenseId,
      eventType: 'TRANSFER',
      createdAt: { gte: yearAgo },
    },
  });

  if (yearlyTransfers >= getLicenseConfig().TRANSFER_LIMIT_PER_YEAR) {
    return {
      allowed: false,
      remaining: 0,
      reason: `Máximo de ${getLicenseConfig().TRANSFER_LIMIT_PER_YEAR} transferências por ano já utilizado.`,
    };
  }

  return {
    allowed: true,
    remaining: getLicenseConfig().TRANSFER_LIMIT_PER_YEAR - yearlyTransfers,
    reason: null,
  };
}

export async function transferLicense(serial: string, hwid: string, transferToken: string) {
  let payload: LicenseTokenPayload;
  try {
    payload = verifyLicenseToken(transferToken);
  } catch {
    throw new UnauthorizedError('Token de transferência inválido ou expirado.');
  }

  if (payload.sub !== serial) {
    throw new ForbiddenError('Token de transferência não corresponde a este serial.');
  }

  const license = await prisma.license.findUnique({ where: { serial } });

  if (!license) {
    throw new NotFoundError('Licença', serial);
  }

  if (license.status === 'REVOKED') {
    throw new ForbiddenError('Licença revogada.');
  }

  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    throw new ForbiddenError('Licença expirada.');
  }

  const eligible = await checkTransferEligibility(license.id);
  if (!eligible.allowed) {
    throw new ForbiddenError(eligible.reason || 'Transferência não permitida.');
  }

  await prisma.license.update({
    where: { id: license.id },
    data: {
      hwid,
      transferCount: { increment: 1 },
      lastTransferredAt: new Date(),
    },
  });

  await prisma.licenseEvent.create({
    data: { licenseId: license.id, hwid, eventType: 'TRANSFER' },
  });

  const newToken = signLicenseToken({ serial, hwid, plan: license.plan });

  return { token: newToken, plan: license.plan, expiresAt: license.expiresAt, status: 'ACTIVE' };
}

// ---------- Admin: CRUD ----------

export async function createLicense(data: {
  customerId: string;
  plan: string;
  periodMonths: number;
}) {
  const serial = await ensureUniqueSerial();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + data.periodMonths);

  const license = await prisma.license.create({
    data: {
      customerId: data.customerId,
      serial,
      plan: data.plan as any,
      expiresAt,
    },
  });

  return license;
}

export async function revokeLicense(licenseId: string) {
  const license = await prisma.license.update({
    where: { id: licenseId },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });

  await prisma.licenseEvent.create({
    data: { licenseId, eventType: 'REVOKE' },
  });

  return license;
}

export async function listLicenses(filters?: { customerId?: string; tenantId?: string; status?: string }) {
  const where: any = {};
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.tenantId) where.customer = { tenantId: filters.tenantId };
  if (filters?.status) where.status = filters.status;

  return prisma.license.findMany({
    where,
    include: { customer: true, payments: true },
    orderBy: { createdAt: 'desc' },
  });
}
