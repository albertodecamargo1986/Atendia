"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const { mockPrisma, mockHwid, mockConfig } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        license: { findUnique: vitest_1.vi.fn(), findFirst: vitest_1.vi.fn(), findMany: vitest_1.vi.fn(), create: vitest_1.vi.fn(), update: vitest_1.vi.fn(), updateMany: vitest_1.vi.fn() },
        licenseEvent: { create: vitest_1.vi.fn(), findFirst: vitest_1.vi.fn(), count: vitest_1.vi.fn() },
    },
    mockHwid: { isSameMachine: vitest_1.vi.fn() },
    mockConfig: {
        getConfig: vitest_1.vi.fn(() => ({
            JWT_SECRET: 'test-license-jwt-secret-min16ch',
            LICENSE_JWT_SECRET: 'test-license-jwt-secret-min16ch',
            LICENSE_JWT_EXPIRES_IN: '24h',
            OFFLINE_TOLERANCE_DAYS: 7,
            TRANSFER_LIMIT_PER_YEAR: 2,
        })),
    },
}));
vitest_1.vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vitest_1.vi.mock('../lib/hwid.js', () => mockHwid);
vitest_1.vi.mock('../config/index.js', () => mockConfig);
const license_service_js_1 = require("../services/license.service.js");
const errors_js_1 = require("../lib/errors.js");
const mockLicense = {
    id: 'lic-1', serial: 'ATND-ABCD-EFGH-IJKL-MNOP', plan: 'STARTER',
    status: 'INACTIVE', hwid: null,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    activatedAt: null, transferCount: 0, lastTransferredAt: null,
};
const JWT_SECRET = 'test-license-jwt-secret-min16ch';
(0, vitest_1.describe)('license.service — generateSerial', () => {
    (0, vitest_1.it)('generates serial in ATND-XXXX-XXXX-XXXX-XXXX format', () => {
        const serial = (0, license_service_js_1.generateSerial)();
        (0, vitest_1.expect)(serial).toMatch(/^ATND-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });
    (0, vitest_1.it)('generates unique serials (probabilistic)', () => {
        const serials = new Set(Array.from({ length: 50 }, () => (0, license_service_js_1.generateSerial)()));
        (0, vitest_1.expect)(serials.size).toBeGreaterThan(40);
    });
});
(0, vitest_1.describe)('license.service — verifyLicenseToken', () => {
    (0, vitest_1.it)('round-trip: verifyLicenseToken works with signed token', () => {
        const token = jsonwebtoken_1.default.sign({ sub: 'ATND-ABCD-EFGH-IJKL-MNOP', hwid: 'hwid-1', plan: 'STARTER', iss: 'atend-ia' }, JWT_SECRET, { expiresIn: '24h' });
        const payload = (0, license_service_js_1.verifyLicenseToken)(token);
        (0, vitest_1.expect)(payload.sub).toBe('ATND-ABCD-EFGH-IJKL-MNOP');
        (0, vitest_1.expect)(payload.plan).toBe('STARTER');
    });
    (0, vitest_1.it)('rejects invalid token', () => {
        (0, vitest_1.expect)(() => (0, license_service_js_1.verifyLicenseToken)('invalid-token')).toThrow();
    });
});
(0, vitest_1.describe)('license.service — activateLicense', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('first activation — sets hwid and status ACTIVE', async () => {
        mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, hwid: null });
        mockPrisma.license.update.mockResolvedValue({ ...mockLicense, status: 'ACTIVE', hwid: 'hwid-1' });
        mockPrisma.licenseEvent.create.mockResolvedValue({});
        const result = await (0, license_service_js_1.activateLicense)('ATND-ABCD-EFGH-IJKL-MNOP', 'hwid-1');
        (0, vitest_1.expect)(result.status).toBe('ACTIVE');
        (0, vitest_1.expect)(result.token).toBeDefined();
        (0, vitest_1.expect)(mockPrisma.license.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({ hwid: 'hwid-1', status: 'ACTIVE' }),
        }));
    });
    (0, vitest_1.it)('same machine — reissues token', async () => {
        mockHwid.isSameMachine.mockReturnValue(true);
        mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, hwid: 'hwid-1', status: 'ACTIVE' });
        mockPrisma.license.update.mockResolvedValue({ ...mockLicense, status: 'ACTIVE' });
        mockPrisma.licenseEvent.create.mockResolvedValue({});
        const result = await (0, license_service_js_1.activateLicense)('ATND-ABCD-EFGH-IJKL-MNOP', 'hwid-1');
        (0, vitest_1.expect)(result.status).toBe('ACTIVE');
        (0, vitest_1.expect)(mockHwid.isSameMachine).toHaveBeenCalledWith('hwid-1', 'hwid-1');
    });
    (0, vitest_1.it)('different machine within transfer limit — transfers', async () => {
        mockHwid.isSameMachine.mockReturnValue(false);
        mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, hwid: 'hwid-1', status: 'ACTIVE' });
        mockPrisma.licenseEvent.count.mockResolvedValue(0);
        mockPrisma.license.update.mockResolvedValue({ ...mockLicense, hwid: 'hwid-2', transferCount: 1 });
        mockPrisma.licenseEvent.create.mockResolvedValue({});
        const result = await (0, license_service_js_1.activateLicense)('ATND-ABCD-EFGH-IJKL-MNOP', 'hwid-2');
        (0, vitest_1.expect)(result.status).toBe('ACTIVE');
        (0, vitest_1.expect)(mockPrisma.license.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({ hwid: 'hwid-2', transferCount: { increment: 1 } }),
        }));
    });
    (0, vitest_1.it)('different machine over transfer limit — ForbiddenError', async () => {
        mockHwid.isSameMachine.mockReturnValue(false);
        mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, hwid: 'hwid-1', status: 'ACTIVE' });
        mockPrisma.licenseEvent.count.mockResolvedValue(2);
        await (0, vitest_1.expect)((0, license_service_js_1.activateLicense)('ATND-ABCD-EFGH-IJKL-MNOP', 'hwid-3'))
            .rejects.toThrow(errors_js_1.ForbiddenError);
    });
    (0, vitest_1.it)('expired license — ForbiddenError', async () => {
        mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, expiresAt: new Date('2020-01-01') });
        await (0, vitest_1.expect)((0, license_service_js_1.activateLicense)('ATND-ABCD-EFGH-IJKL-MNOP', 'hwid-1'))
            .rejects.toThrow(errors_js_1.ForbiddenError);
    });
    (0, vitest_1.it)('revoked license — ForbiddenError', async () => {
        mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, status: 'REVOKED' });
        await (0, vitest_1.expect)((0, license_service_js_1.activateLicense)('ATND-ABCD-EFGH-IJKL-MNOP', 'hwid-1'))
            .rejects.toThrow(errors_js_1.ForbiddenError);
    });
    (0, vitest_1.it)('non-existent serial — NotFoundError', async () => {
        mockPrisma.license.findUnique.mockResolvedValue(null);
        await (0, vitest_1.expect)((0, license_service_js_1.activateLicense)('ATND-NONO-EXIST-NOPE-NOPE', 'hwid-1'))
            .rejects.toThrow(errors_js_1.NotFoundError);
    });
});
(0, vitest_1.describe)('license.service — validateLicense', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('valid token with matching hwid', async () => {
        mockHwid.isSameMachine.mockReturnValue(true);
        const token = jsonwebtoken_1.default.sign({ sub: 'ATND-ABCD-EFGH-IJKL-MNOP', hwid: 'hwid-1', plan: 'STARTER', iss: 'atend-ia' }, JWT_SECRET, { expiresIn: '24h' });
        mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, status: 'ACTIVE' });
        mockPrisma.licenseEvent.findFirst.mockResolvedValue({ createdAt: new Date() });
        const result = await (0, license_service_js_1.validateLicense)(token, 'hwid-1');
        (0, vitest_1.expect)(result.valid).toBe(true);
    });
    (0, vitest_1.it)('expired token — UnauthorizedError', async () => {
        const token = jsonwebtoken_1.default.sign({ sub: 'ATND-ABCD-EFGH-IJKL-MNOP', hwid: 'hwid-1', plan: 'STARTER', iss: 'atend-ia' }, JWT_SECRET, { expiresIn: '-1s' });
        await (0, vitest_1.expect)((0, license_service_js_1.validateLicense)(token, 'hwid-1')).rejects.toThrow(errors_js_1.UnauthorizedError);
    });
    (0, vitest_1.it)('hwid mismatch — ForbiddenError', async () => {
        mockHwid.isSameMachine.mockReturnValue(false);
        const token = jsonwebtoken_1.default.sign({ sub: 'ATND-ABCD-EFGH-IJKL-MNOP', hwid: 'hwid-1', plan: 'STARTER', iss: 'atend-ia' }, JWT_SECRET, { expiresIn: '24h' });
        await (0, vitest_1.expect)((0, license_service_js_1.validateLicense)(token, 'hwid-different')).rejects.toThrow(errors_js_1.ForbiddenError);
    });
    (0, vitest_1.it)('revoked license — ForbiddenError', async () => {
        mockHwid.isSameMachine.mockReturnValue(true);
        const token = jsonwebtoken_1.default.sign({ sub: 'ATND-ABCD-EFGH-IJKL-MNOP', hwid: 'hwid-1', plan: 'STARTER', iss: 'atend-ia' }, JWT_SECRET, { expiresIn: '24h' });
        mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, status: 'REVOKED' });
        await (0, vitest_1.expect)((0, license_service_js_1.validateLicense)(token, 'hwid-1')).rejects.toThrow(errors_js_1.ForbiddenError);
    });
    (0, vitest_1.it)('offline too long — returns valid=false', async () => {
        mockHwid.isSameMachine.mockReturnValue(true);
        const token = jsonwebtoken_1.default.sign({ sub: 'ATND-ABCD-EFGH-IJKL-MNOP', hwid: 'hwid-1', plan: 'STARTER', iss: 'atend-ia' }, JWT_SECRET, { expiresIn: '24h' });
        mockPrisma.license.findUnique.mockResolvedValue({ ...mockLicense, status: 'ACTIVE' });
        mockPrisma.licenseEvent.findFirst.mockResolvedValue({
            createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        });
        const result = await (0, license_service_js_1.validateLicense)(token, 'hwid-1');
        (0, vitest_1.expect)(result.valid).toBe(false);
    });
});
(0, vitest_1.describe)('license.service — checkTransferEligibility', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('allowed when under limit', async () => {
        mockPrisma.licenseEvent.count.mockResolvedValue(0);
        const result = await (0, license_service_js_1.checkTransferEligibility)('lic-1');
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(result.remaining).toBe(2);
    });
    (0, vitest_1.it)('blocked when at limit', async () => {
        mockPrisma.licenseEvent.count.mockResolvedValue(2);
        const result = await (0, license_service_js_1.checkTransferEligibility)('lic-1');
        (0, vitest_1.expect)(result.allowed).toBe(false);
        (0, vitest_1.expect)(result.remaining).toBe(0);
    });
});
//# sourceMappingURL=license.service.test.js.map