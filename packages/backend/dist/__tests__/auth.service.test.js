"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { mockPrisma, mockJwt, mockTwoFactor, mockBcrypt } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        user: { findUnique: vitest_1.vi.fn(), create: vitest_1.vi.fn() },
        tenant: { findUnique: vitest_1.vi.fn(), create: vitest_1.vi.fn() },
        refreshToken: { findUnique: vitest_1.vi.fn(), create: vitest_1.vi.fn(), delete: vitest_1.vi.fn(), deleteMany: vitest_1.vi.fn() },
    },
    mockJwt: {
        signAccessToken: vitest_1.vi.fn(() => 'access-token-mock'),
        signRefreshToken: vitest_1.vi.fn(() => 'refresh-token-mock'),
        verifyRefreshToken: vitest_1.vi.fn(),
        sign2FATempToken: vitest_1.vi.fn(() => 'temp-token-mock'),
        verify2FATempToken: vitest_1.vi.fn(),
    },
    mockTwoFactor: { verify2FAToken: vitest_1.vi.fn() },
    mockBcrypt: {
        compare: vitest_1.vi.fn(),
        hash: vitest_1.vi.fn(() => Promise.resolve('$2a$12$hashed')),
    },
}));
vitest_1.vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vitest_1.vi.mock('../lib/jwt.js', () => mockJwt);
vitest_1.vi.mock('../services/two-factor.service.js', () => mockTwoFactor);
vitest_1.vi.mock('bcryptjs', () => ({ default: mockBcrypt }));
const auth_service_js_1 = require("../services/auth.service.js");
const errors_js_1 = require("../lib/errors.js");
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
(0, vitest_1.describe)('auth.service — register', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('registers a new user successfully', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        mockPrisma.tenant.findUnique.mockResolvedValue(null);
        mockPrisma.tenant.create.mockResolvedValue({
            id: 'tenant-1', name: 'Test Corp', slug: 'test-corp', plan: 'FREE',
            users: [mockUser],
        });
        mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);
        const result = await (0, auth_service_js_1.register)({
            name: 'Test User', email: 'test@test.com', password: 'Str0ng!Pass',
            tenantName: 'Test Corp', tenantSlug: 'test-corp',
        });
        (0, vitest_1.expect)(result.accessToken).toBe('access-token-mock');
        (0, vitest_1.expect)(result.refreshToken).toBe('refresh-token-mock');
        (0, vitest_1.expect)(result.user.email).toBe('test@test.com');
    });
    (0, vitest_1.it)('rejects duplicate email', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(mockUser);
        await (0, vitest_1.expect)((0, auth_service_js_1.register)({
            name: 'Test User', email: 'test@test.com', password: 'Str0ng!Pass',
            tenantName: 'Test Corp', tenantSlug: 'test-corp',
        })).rejects.toThrow(errors_js_1.ConflictError);
    });
    (0, vitest_1.it)('rejects duplicate slug', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1' });
        await (0, vitest_1.expect)((0, auth_service_js_1.register)({
            name: 'Test User', email: 'new@test.com', password: 'Str0ng!Pass',
            tenantName: 'Test Corp', tenantSlug: 'test-corp',
        })).rejects.toThrow(errors_js_1.ConflictError);
    });
});
(0, vitest_1.describe)('auth.service — login', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('login with valid credentials', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(mockUser);
        mockBcrypt.compare.mockResolvedValue(true);
        mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);
        const result = await (0, auth_service_js_1.login)({ email: 'test@test.com', password: 'Str0ng!Pass' });
        (0, vitest_1.expect)(result.accessToken).toBe('access-token-mock');
        (0, vitest_1.expect)(result.refreshToken).toBe('refresh-token-mock');
    });
    (0, vitest_1.it)('login with invalid password throws UnauthorizedError', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(mockUser);
        mockBcrypt.compare.mockResolvedValue(false);
        await (0, vitest_1.expect)((0, auth_service_js_1.login)({ email: 'test@test.com', password: 'WrongPass1!' }))
            .rejects.toThrow(errors_js_1.UnauthorizedError);
    });
    (0, vitest_1.it)('login with non-existent user still calls bcrypt (timing attack prevention)', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        mockBcrypt.compare.mockResolvedValue(false);
        await (0, vitest_1.expect)((0, auth_service_js_1.login)({ email: 'nope@test.com', password: 'Str0ng!Pass' }))
            .rejects.toThrow(errors_js_1.UnauthorizedError);
        // bcrypt.compare should have been called (with dummy hash)
        (0, vitest_1.expect)(mockBcrypt.compare).toHaveBeenCalled();
    });
    (0, vitest_1.it)('login with inactive user throws UnauthorizedError', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });
        mockBcrypt.compare.mockResolvedValue(false);
        await (0, vitest_1.expect)((0, auth_service_js_1.login)({ email: 'test@test.com', password: 'Str0ng!Pass' }))
            .rejects.toThrow(errors_js_1.UnauthorizedError);
    });
    (0, vitest_1.it)('login with 2FA enabled returns requiresTwoFactor', async () => {
        const user2FA = { ...mockUser, twoFactorEnabled: true };
        mockPrisma.user.findUnique.mockResolvedValue(user2FA);
        mockBcrypt.compare.mockResolvedValue(true);
        const result = await (0, auth_service_js_1.login)({ email: 'test@test.com', password: 'Str0ng!Pass' });
        (0, vitest_1.expect)(result.requiresTwoFactor).toBe(true);
        (0, vitest_1.expect)(result.tempToken).toBe('temp-token-mock');
    });
    (0, vitest_1.it)('login completing 2FA with valid tempToken', async () => {
        const payload = { sub: 'user-1', tenantId: 'tenant-1' };
        mockJwt.verify2FATempToken.mockReturnValue(payload);
        mockPrisma.user.findUnique.mockResolvedValue(mockUser);
        mockTwoFactor.verify2FAToken.mockResolvedValue(true);
        mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);
        const result = await (0, auth_service_js_1.login)({ tempToken: 'temp-token-mock', twoFactorToken: '123456' });
        (0, vitest_1.expect)(result.accessToken).toBe('access-token-mock');
    });
    (0, vitest_1.it)('login with expired 2FA tempToken throws UnauthorizedError', async () => {
        mockJwt.verify2FATempToken.mockImplementation(() => { throw new Error('expired'); });
        await (0, vitest_1.expect)((0, auth_service_js_1.login)({ tempToken: 'expired-token', twoFactorToken: '123456' }))
            .rejects.toThrow(errors_js_1.UnauthorizedError);
    });
});
(0, vitest_1.describe)('auth.service — refresh', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('refreshes tokens with valid refresh token', async () => {
        mockJwt.verifyRefreshToken.mockReturnValue({ sub: 'user-1', tenantId: 'tenant-1' });
        mockPrisma.refreshToken.findUnique.mockResolvedValue(mockRefreshTokenRecord);
        mockPrisma.refreshToken.delete.mockResolvedValue(mockRefreshTokenRecord);
        mockPrisma.user.findUnique.mockResolvedValue(mockUser);
        mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);
        const result = await (0, auth_service_js_1.refresh)('refresh-token-mock');
        (0, vitest_1.expect)(result.accessToken).toBe('access-token-mock');
        (0, vitest_1.expect)(result.refreshToken).toBe('refresh-token-mock');
        (0, vitest_1.expect)(mockPrisma.refreshToken.delete).toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects expired refresh token', async () => {
        mockJwt.verifyRefreshToken.mockReturnValue({ sub: 'user-1', tenantId: 'tenant-1' });
        mockPrisma.refreshToken.findUnique.mockResolvedValue({
            ...mockRefreshTokenRecord, expiresAt: new Date('2020-01-01'),
        });
        await (0, vitest_1.expect)((0, auth_service_js_1.refresh)('expired-token')).rejects.toThrow(errors_js_1.UnauthorizedError);
    });
    (0, vitest_1.it)('rejects non-existent refresh token', async () => {
        mockJwt.verifyRefreshToken.mockReturnValue({ sub: 'user-1', tenantId: 'tenant-1' });
        mockPrisma.refreshToken.findUnique.mockResolvedValue(null);
        await (0, vitest_1.expect)((0, auth_service_js_1.refresh)('unknown-token')).rejects.toThrow(errors_js_1.UnauthorizedError);
    });
});
(0, vitest_1.describe)('auth.service — logout', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('deletes refresh tokens on logout', async () => {
        mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
        await (0, auth_service_js_1.logout)('refresh-token-mock');
        (0, vitest_1.expect)(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
            where: { token: 'refresh-token-mock' },
        });
    });
});
//# sourceMappingURL=auth.service.test.js.map