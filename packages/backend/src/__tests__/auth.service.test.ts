import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockJwt, mockTwoFactor, mockBcrypt } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    tenant: { findUnique: vi.fn(), create: vi.fn() },
    refreshToken: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  },
  mockJwt: {
    signAccessToken: vi.fn(() => 'access-token-mock'),
    signRefreshToken: vi.fn(() => 'refresh-token-mock'),
    verifyRefreshToken: vi.fn(),
    sign2FATempToken: vi.fn(() => 'temp-token-mock'),
    verify2FATempToken: vi.fn(),
  },
  mockTwoFactor: { verify2FAToken: vi.fn() },
  mockBcrypt: {
    compare: vi.fn(),
    hash: vi.fn(() => Promise.resolve('$2a$12$hashed')),
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/jwt.js', () => mockJwt);
vi.mock('../services/two-factor.service.js', () => mockTwoFactor);
vi.mock('bcryptjs', () => ({ default: mockBcrypt }));

import { login, register, refresh, logout } from '../services/auth.service.js';
import { UnauthorizedError, ConflictError } from '../lib/errors.js';

const mockUser = {
  id: 'user-1', email: 'test@test.com', name: 'Test User',
  passwordHash: '$2a$12$hash', role: 'OWNER', isActive: true,
  twoFactorEnabled: false, twoFactorSecret: null, tenantId: 'tenant-1',
  tenant: { id: 'tenant-1', name: 'Test Corp', slug: 'test-corp', plan: 'FREE' },
};

const mockRefreshTokenRecord = {
  id: 'rt-1', token: 'refresh-token-mock', userId: 'user-1',
  tenantId: 'tenant-1', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
};

describe('auth.service — register', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('registers a new user successfully', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    mockPrisma.tenant.create.mockResolvedValue({
      id: 'tenant-1', name: 'Test Corp', slug: 'test-corp', plan: 'FREE',
      users: [mockUser],
    });
    mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

    const result = await register({
      name: 'Test User', email: 'test@test.com', password: 'Str0ng!Pass',
      tenantName: 'Test Corp', tenantSlug: 'test-corp',
    });

    expect(result.accessToken).toBe('access-token-mock');
    expect(result.refreshToken).toBe('refresh-token-mock');
    expect(result.user.email).toBe('test@test.com');
  });

  it('rejects duplicate email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    await expect(register({
      name: 'Test User', email: 'test@test.com', password: 'Str0ng!Pass',
      tenantName: 'Test Corp', tenantSlug: 'test-corp',
    })).rejects.toThrow(ConflictError);
  });

  it('rejects duplicate slug', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1' });

    await expect(register({
      name: 'Test User', email: 'new@test.com', password: 'Str0ng!Pass',
      tenantName: 'Test Corp', tenantSlug: 'test-corp',
    })).rejects.toThrow(ConflictError);
  });
});

describe('auth.service — login', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('login with valid credentials', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockBcrypt.compare.mockResolvedValue(true);
    mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

    const result = await login({ email: 'test@test.com', password: 'Str0ng!Pass' });
    expect(result.accessToken).toBe('access-token-mock');
    expect(result.refreshToken).toBe('refresh-token-mock');
  });

  it('login with invalid password throws UnauthorizedError', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockBcrypt.compare.mockResolvedValue(false);

    await expect(login({ email: 'test@test.com', password: 'WrongPass1!' }))
      .rejects.toThrow(UnauthorizedError);
  });

  it('login with non-existent user still calls bcrypt (timing attack prevention)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockBcrypt.compare.mockResolvedValue(false);

    await expect(login({ email: 'nope@test.com', password: 'Str0ng!Pass' }))
      .rejects.toThrow(UnauthorizedError);
    // bcrypt.compare should have been called (with dummy hash)
    expect(mockBcrypt.compare).toHaveBeenCalled();
  });

  it('login with inactive user throws UnauthorizedError', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });
    mockBcrypt.compare.mockResolvedValue(false);

    await expect(login({ email: 'test@test.com', password: 'Str0ng!Pass' }))
      .rejects.toThrow(UnauthorizedError);
  });

  it('login with 2FA enabled returns requiresTwoFactor', async () => {
    const user2FA = { ...mockUser, twoFactorEnabled: true };
    mockPrisma.user.findUnique.mockResolvedValue(user2FA);
    mockBcrypt.compare.mockResolvedValue(true);

    const result = await login({ email: 'test@test.com', password: 'Str0ng!Pass' });
    expect(result.requiresTwoFactor).toBe(true);
    expect(result.tempToken).toBe('temp-token-mock');
  });

  it('login completing 2FA with valid tempToken', async () => {
    const payload = { sub: 'user-1', tenantId: 'tenant-1' };
    mockJwt.verify2FATempToken.mockReturnValue(payload);
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockTwoFactor.verify2FAToken.mockResolvedValue(true);
    mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

    const result = await login({ tempToken: 'temp-token-mock', twoFactorToken: '123456' });
    expect(result.accessToken).toBe('access-token-mock');
  });

  it('login with expired 2FA tempToken throws UnauthorizedError', async () => {
    mockJwt.verify2FATempToken.mockImplementation(() => { throw new Error('expired'); });

    await expect(login({ tempToken: 'expired-token', twoFactorToken: '123456' }))
      .rejects.toThrow(UnauthorizedError);
  });
});

describe('auth.service — refresh', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('refreshes tokens with valid refresh token', async () => {
    mockJwt.verifyRefreshToken.mockReturnValue({ sub: 'user-1', tenantId: 'tenant-1' });
    mockPrisma.refreshToken.findUnique.mockResolvedValue(mockRefreshTokenRecord);
    mockPrisma.refreshToken.delete.mockResolvedValue(mockRefreshTokenRecord);
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

    const result = await refresh('refresh-token-mock');
    expect(result.accessToken).toBe('access-token-mock');
    expect(result.refreshToken).toBe('refresh-token-mock');
    expect(mockPrisma.refreshToken.delete).toHaveBeenCalled();
  });

  it('rejects expired refresh token', async () => {
    mockJwt.verifyRefreshToken.mockReturnValue({ sub: 'user-1', tenantId: 'tenant-1' });
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      ...mockRefreshTokenRecord, expiresAt: new Date('2020-01-01'),
    });

    await expect(refresh('expired-token')).rejects.toThrow(UnauthorizedError);
  });

  it('rejects non-existent refresh token', async () => {
    mockJwt.verifyRefreshToken.mockReturnValue({ sub: 'user-1', tenantId: 'tenant-1' });
    mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(refresh('unknown-token')).rejects.toThrow(UnauthorizedError);
  });
});

describe('auth.service — logout', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('deletes refresh tokens on logout', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    await logout('refresh-token-mock');
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'refresh-token-mock' },
    });
  });
});
