"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { mockPrisma, mockBcrypt } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        user: {
            findMany: vitest_1.vi.fn(),
            findFirst: vitest_1.vi.fn(),
            findUnique: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
            delete: vitest_1.vi.fn(),
            count: vitest_1.vi.fn(),
            groupBy: vitest_1.vi.fn(),
        },
        refreshToken: { deleteMany: vitest_1.vi.fn() },
        auditLog: { create: vitest_1.vi.fn() },
    },
    mockBcrypt: {
        compare: vitest_1.vi.fn(),
        hash: vitest_1.vi.fn(() => Promise.resolve('$2a$12$hashed')),
    },
}));
vitest_1.vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vitest_1.vi.mock('bcryptjs', () => ({ default: mockBcrypt }));
const user_service_js_1 = require("../services/user.service.js");
const errors_js_1 = require("../lib/errors.js");
const tenantId = 'tenant-1';
const userId = 'user-1';
const mockUser = {
    id: userId, name: 'Joao Silva', email: 'joao@test.com',
    role: 'ADMIN', isActive: true, avatarUrl: null, emailVerified: true,
    createdAt: new Date(), updatedAt: new Date(),
    _count: { conversations: 0, auditLogs: 0 },
};
(0, vitest_1.describe)('user.service — listUsers', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('returns all users for tenant', async () => {
        mockPrisma.user.findMany.mockResolvedValue([mockUser]);
        const result = await (0, user_service_js_1.listUsers)(tenantId);
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(mockPrisma.user.findMany).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ where: { tenantId } }));
    });
});
(0, vitest_1.describe)('user.service — getUser', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('throws NotFoundError for non-existent user', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(null);
        await (0, vitest_1.expect)((0, user_service_js_1.getUser)(tenantId, 'nope')).rejects.toThrow(errors_js_1.NotFoundError);
    });
    (0, vitest_1.it)('returns user when found', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        const result = await (0, user_service_js_1.getUser)(tenantId, userId);
        (0, vitest_1.expect)(result.id).toBe(userId);
    });
});
(0, vitest_1.describe)('user.service — createUser', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('rejects duplicate email', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing', email: 'joao@test.com' });
        await (0, vitest_1.expect)((0, user_service_js_1.createUser)(tenantId, {
            name: 'Joao', email: 'joao@test.com', password: '123456', role: 'OPERATOR',
        }, 'admin-1')).rejects.toThrow(errors_js_1.ConflictError);
    });
    (0, vitest_1.it)('creates user with hashed password and audit log', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        mockPrisma.user.create.mockResolvedValue(mockUser);
        mockPrisma.auditLog.create.mockResolvedValue({});
        const result = await (0, user_service_js_1.createUser)(tenantId, {
            name: 'Joao', email: 'joao@test.com', password: '123456', role: 'OPERATOR',
        }, 'admin-1');
        (0, vitest_1.expect)(mockBcrypt.hash).toHaveBeenCalledWith('123456', 12);
        (0, vitest_1.expect)(mockPrisma.auditLog.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ data: vitest_1.expect.objectContaining({ action: 'INVITE_USER' }) }));
        (0, vitest_1.expect)(result.id).toBe(userId);
    });
});
(0, vitest_1.describe)('user.service — updateUser', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('rejects update of OWNER role', async () => {
        mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'OWNER' });
        await (0, vitest_1.expect)((0, user_service_js_1.updateUser)(tenantId, userId, { role: 'ADMIN' }, 'admin-1'))
            .rejects.toThrow(errors_js_1.ForbiddenError);
    });
    (0, vitest_1.it)('updates non-owner user and creates audit log', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        mockPrisma.user.update.mockResolvedValue({ ...mockUser, role: 'SUPERVISOR' });
        mockPrisma.auditLog.create.mockResolvedValue({});
        const result = await (0, user_service_js_1.updateUser)(tenantId, userId, { role: 'SUPERVISOR' }, 'admin-1');
        (0, vitest_1.expect)(mockPrisma.user.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ data: vitest_1.expect.objectContaining({ role: 'SUPERVISOR' }) }));
        (0, vitest_1.expect)(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
});
(0, vitest_1.describe)('user.service — toggleUserActive', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('rejects toggling OWNER', async () => {
        mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'OWNER' });
        await (0, vitest_1.expect)((0, user_service_js_1.toggleUserActive)(tenantId, userId, 'admin-1'))
            .rejects.toThrow(errors_js_1.ForbiddenError);
    });
    (0, vitest_1.it)('toggles isActive from true to false', async () => {
        mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, isActive: true });
        mockPrisma.user.update.mockResolvedValue({ ...mockUser, isActive: false });
        mockPrisma.auditLog.create.mockResolvedValue({});
        const result = await (0, user_service_js_1.toggleUserActive)(tenantId, userId, 'admin-1');
        (0, vitest_1.expect)(mockPrisma.user.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ data: { isActive: false } }));
    });
});
(0, vitest_1.describe)('user.service — deleteUser', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('rejects deleting OWNER', async () => {
        mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'OWNER' });
        await (0, vitest_1.expect)((0, user_service_js_1.deleteUser)(tenantId, userId, 'admin-1'))
            .rejects.toThrow(errors_js_1.ForbiddenError);
    });
    (0, vitest_1.it)('deletes refresh tokens and user', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
        mockPrisma.user.delete.mockResolvedValue({ id: userId, name: 'Joao', email: 'joao@test.com' });
        mockPrisma.auditLog.create.mockResolvedValue({});
        await (0, user_service_js_1.deleteUser)(tenantId, userId, 'admin-1');
        (0, vitest_1.expect)(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId } });
        (0, vitest_1.expect)(mockPrisma.user.delete).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ where: { id: userId } }));
    });
});
(0, vitest_1.describe)('user.service — updateProfile', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('rejects wrong current password', async () => {
        mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, passwordHash: '$2a$12$hash' });
        mockBcrypt.compare.mockResolvedValue(false);
        await (0, vitest_1.expect)((0, user_service_js_1.updateProfile)(userId, tenantId, {
            currentPassword: 'wrongpw', newPassword: 'newpass1',
        })).rejects.toThrow(errors_js_1.UnauthorizedError);
    });
    (0, vitest_1.it)('updates name and password when valid', async () => {
        mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, passwordHash: '$2a$12$hash' });
        mockBcrypt.compare.mockResolvedValue(true);
        mockPrisma.user.update.mockResolvedValue({ id: userId, name: 'New Name', email: 'joao@test.com', role: 'ADMIN' });
        await (0, user_service_js_1.updateProfile)(userId, tenantId, {
            name: 'New Name', currentPassword: 'oldpass', newPassword: 'newpass1',
        });
        (0, vitest_1.expect)(mockPrisma.user.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ data: vitest_1.expect.objectContaining({ name: 'New Name' }) }));
    });
    (0, vitest_1.it)('rejects when no data to update', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(mockUser);
        await (0, vitest_1.expect)((0, user_service_js_1.updateProfile)(userId, tenantId, {})).rejects.toThrow(errors_js_1.ValidationError);
    });
});
(0, vitest_1.describe)('user.service — getTeamStats', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('returns total, active, inactive and byRole', async () => {
        mockPrisma.user.count.mockResolvedValueOnce(5);
        mockPrisma.user.count.mockResolvedValueOnce(4);
        mockPrisma.user.groupBy.mockResolvedValue([
            { role: 'OWNER', _count: 1 },
            { role: 'ADMIN', _count: 2 },
            { role: 'OPERATOR', _count: 2 },
        ]);
        const stats = await (0, user_service_js_1.getTeamStats)(tenantId);
        (0, vitest_1.expect)(stats.total).toBe(5);
        (0, vitest_1.expect)(stats.active).toBe(4);
        (0, vitest_1.expect)(stats.inactive).toBe(1);
        (0, vitest_1.expect)(stats.byRole.OWNER).toBe(1);
    });
});
//# sourceMappingURL=user.service.test.js.map