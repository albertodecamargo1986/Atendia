import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const { mockPrisma, mockHwid, mockConfig } = vi.hoisted(() => ({
  mockPrisma: {
    license: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    licenseEvent: { create: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  },
  mockHwid: { isSameMachine: vi.fn() },
  mockConfig: {
    getConfig: vi.fn(() => ({
      JWT_SECRET: 'test-license-jwt-secret-min16ch',
      LICENSE_JWT_SECRET: 'test-license-jwt-secret-min16ch',
      LICENSE_JWT_EXPIRES_IN: '24h',
      OFFLINE_TOLERANCE_DAYS: 7,
      TRANSFER_LIMIT_PER_YEAR: 2,
    })),
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/hwid.js', () => mockHwid);
vi.mock('../config/index.js', () => mockConfig);

import {
  generateSerial, verifyLicenseToken, activateLicense,
  validateLicense, checkTransferEligibility,
} from '../services/license.service.js';
import { ForbiddenError, UnauthorizedError, NotFoundError } from '../lib/errors.js';

const mockLicense = {
  id: 'lic-1', serial: 'ATND-ABCD-EFGH-IJKL-MNOP', plan: 'STARTER',
  status: 'INACTIVE', hwid: null,
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  activatedAt: null, transferCount: 0, lastTransferredAt: null,
};

const JWT_SECRET = 'test-license-jwt-secret-min16ch';

describe('license.service — generateSerial', () => {
  it('generates serial in ATND-XXXX-XXXX-XXXX-XXXX format', () => {
    const serial = generateSerial();
    expect(serial).toMatch(/^ATND-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('generates unique serials (probabilistic)', () => {
    const serials = new Set(Array.from({ length: 50 }, () => generateSerial()));
    expect(serials.size).toBeGreaterThan(40);
  });
});

describe('license.service — verifyLicenseToken', () => {
  it('round-trip: verifyLicenseToken works with signed token', () => {
    const token = jwt.sign(
      { sub: 'ATND-ABCD-EFGH-IJKL-MNOP', hwid: 'hwid-1', plan: 'STARTER', iss: 'atend-ia' },
      JWT_SECRET, { expiresIn: '24h' },
    );

    const payload = verifyLicenseToken(token);
    expect(payload.sub).toBe('ATND-ABCD-EFGH-IJKL-MNOP');
    expect(payload.plan).toBe('STARTER');
  });

  it('rejects invalid token', () => {
    expect(() => verifyLicenseToken('invalid-token')).toThrow();
  });
});

describe('license.service — activateLicense', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('first activation — sets hwid and status ACTIVE', async () => {
    mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, hwid: null });
    mockPrisma.license.update.mockResolvedValue({ ...mockLicense, status: 'ACTIVE', hwid: 'hwid-1' });
    mockPrisma.licenseEvent.create.mockResolvedValue({});

    const result = await activateLicense('ATND-ABCD-EFGH-IJKL-MNOP', 'hwid-1');
    expect(result.status).toBe('ACTIVE');
    expect(result.token).toBeDefined();
    expect(mockPrisma.license.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hwid: 'hwid-1', status: 'ACTIVE' }),
      }),
    );
  });

  it('same machine — reissues token', async () => {
    mockHwid.isSameMachine.mockReturnValue(true);
    mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, hwid: 'hwid-1', status: 'ACTIVE' });
    mockPrisma.license.update.mockResolvedValue({ ...mockLicense, status: 'ACTIVE' });
    mockPrisma.licenseEvent.create.mockResolvedValue({});

    const result = await activateLicense('ATND-ABCD-EFGH-IJKL-MNOP', 'hwid-1');
    expect(result.status).toBe('ACTIVE');
    expect(mockHwid.isSameMachine).toHaveBeenCalledWith('hwid-1', 'hwid-1');
  });

  it('different machine within transfer limit — transfers', async () => {
    mockHwid.isSameMachine.mockReturnValue(false);
    mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, hwid: 'hwid-1', status: 'ACTIVE' });
    mockPrisma.licenseEvent.count.mockResolvedValue(0);
    mockPrisma.license.update.mockResolvedValue({ ...mockLicense, hwid: 'hwid-2', transferCount: 1 });
    mockPrisma.licenseEvent.create.mockResolvedValue({});

    const result = await activateLicense('ATND-ABCD-EFGH-IJKL-MNOP', 'hwid-2');
    expect(result.status).toBe('ACTIVE');
    expect(mockPrisma.license.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hwid: 'hwid-2', transferCount: { increment: 1 } }),
      }),
    );
  });

  it('different machine over transfer limit — ForbiddenError', async () => {
    mockHwid.isSameMachine.mockReturnValue(false);
    mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, hwid: 'hwid-1', status: 'ACTIVE' });
    mockPrisma.licenseEvent.count.mockResolvedValue(2);

    await expect(activateLicense('ATND-ABCD-EFGH-IJKL-MNOP', 'hwid-3'))
      .rejects.toThrow(ForbiddenError);
  });

  it('expired license — ForbiddenError', async () => {
    mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, expiresAt: new Date('2020-01-01') });

    await expect(activateLicense('ATND-ABCD-EFGH-IJKL-MNOP', 'hwid-1'))
      .rejects.toThrow(ForbiddenError);
  });

  it('revoked license — ForbiddenError', async () => {
    mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, status: 'REVOKED' });

    await expect(activateLicense('ATND-ABCD-EFGH-IJKL-MNOP', 'hwid-1'))
      .rejects.toThrow(ForbiddenError);
  });

  it('non-existent serial — NotFoundError', async () => {
    mockPrisma.license.findUnique.mockResolvedValue(null);

    await expect(activateLicense('ATND-NONO-EXIST-NOPE-NOPE', 'hwid-1'))
      .rejects.toThrow(NotFoundError);
  });
});

describe('license.service — validateLicense', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('valid token with matching hwid', async () => {
    mockHwid.isSameMachine.mockReturnValue(true);
    const token = jwt.sign(
      { sub: 'ATND-ABCD-EFGH-IJKL-MNOP', hwid: 'hwid-1', plan: 'STARTER', iss: 'atend-ia' },
      JWT_SECRET, { expiresIn: '24h' },
    );

    mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, status: 'ACTIVE' });
    mockPrisma.licenseEvent.findFirst.mockResolvedValue({ createdAt: new Date() });

    const result = await validateLicense(token, 'hwid-1');
    expect(result.valid).toBe(true);
  });

  it('expired token — UnauthorizedError', async () => {
    const token = jwt.sign(
      { sub: 'ATND-ABCD-EFGH-IJKL-MNOP', hwid: 'hwid-1', plan: 'STARTER', iss: 'atend-ia' },
      JWT_SECRET, { expiresIn: '-1s' },
    );

    await expect(validateLicense(token, 'hwid-1')).rejects.toThrow(UnauthorizedError);
  });

  it('hwid mismatch — ForbiddenError', async () => {
    mockHwid.isSameMachine.mockReturnValue(false);
    const token = jwt.sign(
      { sub: 'ATND-ABCD-EFGH-IJKL-MNOP', hwid: 'hwid-1', plan: 'STARTER', iss: 'atend-ia' },
      JWT_SECRET, { expiresIn: '24h' },
    );

    await expect(validateLicense(token, 'hwid-different')).rejects.toThrow(ForbiddenError);
  });

  it('revoked license — ForbiddenError', async () => {
    mockHwid.isSameMachine.mockReturnValue(true);
    const token = jwt.sign(
      { sub: 'ATND-ABCD-EFGH-IJKL-MNOP', hwid: 'hwid-1', plan: 'STARTER', iss: 'atend-ia' },
      JWT_SECRET, { expiresIn: '24h' },
    );

    mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, status: 'REVOKED' });

    await expect(validateLicense(token, 'hwid-1')).rejects.toThrow(ForbiddenError);
  });

  it('offline too long — returns valid=false', async () => {
    mockHwid.isSameMachine.mockReturnValue(true);
    const token = jwt.sign(
      { sub: 'ATND-ABCD-EFGH-IJKL-MNOP', hwid: 'hwid-1', plan: 'STARTER', iss: 'atend-ia' },
      JWT_SECRET, { expiresIn: '24h' },
    );

    mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, status: 'ACTIVE' });
    mockPrisma.licenseEvent.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });

    const result = await validateLicense(token, 'hwid-1');
    expect(result.valid).toBe(false);
  });
});

describe('license.service — checkTransferEligibility', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('allowed when under limit', async () => {
    mockPrisma.licenseEvent.count.mockResolvedValue(0);
    const result = await checkTransferEligibility('lic-1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('blocked when at limit', async () => {
    mockPrisma.licenseEvent.count.mockResolvedValue(2);
    const result = await checkTransferEligibility('lic-1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
