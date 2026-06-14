import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockBcrypt } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    refreshToken: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  mockBcrypt: {
    compare: vi.fn(),
    hash: vi.fn(() => Promise.resolve('$2a$12$hashed')),
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('bcryptjs', () => ({ default: mockBcrypt }));

import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  toggleUserActive,
  deleteUser,
  updateProfile,
  getTeamStats,
} from '../services/user.service.js';
import { NotFoundError, ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from '../lib/errors.js';

const tenantId = 'tenant-1';
const userId = 'user-1';

const mockUser = {
  id: userId, name: 'Joao Silva', email: 'joao@test.com',
  role: 'ADMIN', isActive: true, avatarUrl: null, emailVerified: true,
  createdAt: new Date(), updatedAt: new Date(),
  _count: { conversations: 0, auditLogs: 0 },
};

describe('user.service — listUsers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns all users for tenant', async () => {
    mockPrisma.user.findMany.mockResolvedValue([mockUser]);
    const result = await listUsers(tenantId);
    expect(result).toHaveLength(1);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId } }),
    );
  });
});

describe('user.service — getUser', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws NotFoundError for non-existent user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await expect(getUser(tenantId, 'nope')).rejects.toThrow(NotFoundError);
  });

  it('returns user when found', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    const result = await getUser(tenantId, userId);
    expect(result.id).toBe(userId);
  });
});

describe('user.service — createUser', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects duplicate email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing', email: 'joao@test.com' });
    await expect(createUser(tenantId, {
      name: 'Joao', email: 'joao@test.com', password: '123456', role: 'OPERATOR',
    }, 'admin-1')).rejects.toThrow(ConflictError);
  });

  it('creates user with hashed password and audit log', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue(mockUser);
    mockPrisma.auditLog.create.mockResolvedValue({});

    const result = await createUser(tenantId, {
      name: 'Joao', email: 'joao@test.com', password: '123456', role: 'OPERATOR',
    }, 'admin-1');

    expect(mockBcrypt.hash).toHaveBeenCalledWith('123456', 12);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'INVITE_USER' }) }),
    );
    expect(result.id).toBe(userId);
  });
});

describe('user.service — updateUser', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects update of OWNER role', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'OWNER' });
    await expect(updateUser(tenantId, userId, { role: 'ADMIN' }, 'admin-1'))
      .rejects.toThrow(ForbiddenError);
  });

  it('updates non-owner user and creates audit log', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockPrisma.user.update.mockResolvedValue({ ...mockUser, role: 'SUPERVISOR' });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const result = await updateUser(tenantId, userId, { role: 'SUPERVISOR' }, 'admin-1');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'SUPERVISOR' }) }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });
});

describe('user.service — toggleUserActive', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects toggling OWNER', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'OWNER' });
    await expect(toggleUserActive(tenantId, userId, 'admin-1'))
      .rejects.toThrow(ForbiddenError);
  });

  it('toggles isActive from true to false', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, isActive: true });
    mockPrisma.user.update.mockResolvedValue({ ...mockUser, isActive: false });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const result = await toggleUserActive(tenantId, userId, 'admin-1');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });
});

describe('user.service — deleteUser', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects deleting OWNER', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'OWNER' });
    await expect(deleteUser(tenantId, userId, 'admin-1'))
      .rejects.toThrow(ForbiddenError);
  });

  it('deletes refresh tokens and user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.user.delete.mockResolvedValue({ id: userId, name: 'Joao', email: 'joao@test.com' });
    mockPrisma.auditLog.create.mockResolvedValue({});

    await deleteUser(tenantId, userId, 'admin-1');
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId } });
    expect(mockPrisma.user.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: userId } }),
    );
  });
});

describe('user.service — updateProfile', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects wrong current password', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, passwordHash: '$2a$12$hash' });
    mockBcrypt.compare.mockResolvedValue(false);

    await expect(updateProfile(userId, tenantId, {
      currentPassword: 'wrongpw', newPassword: 'newpass1',
    })).rejects.toThrow(UnauthorizedError);
  });

  it('updates name and password when valid', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, passwordHash: '$2a$12$hash' });
    mockBcrypt.compare.mockResolvedValue(true);
    mockPrisma.user.update.mockResolvedValue({ id: userId, name: 'New Name', email: 'joao@test.com', role: 'ADMIN' });

    await updateProfile(userId, tenantId, {
      name: 'New Name', currentPassword: 'oldpass', newPassword: 'newpass1',
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'New Name' }) }),
    );
  });

  it('rejects when no data to update', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    await expect(updateProfile(userId, tenantId, {})).rejects.toThrow(ValidationError);
  });
});

describe('user.service — getTeamStats', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns total, active, inactive and byRole', async () => {
    mockPrisma.user.count.mockResolvedValueOnce(5);
    mockPrisma.user.count.mockResolvedValueOnce(4);
    mockPrisma.user.groupBy.mockResolvedValue([
      { role: 'OWNER', _count: 1 },
      { role: 'ADMIN', _count: 2 },
      { role: 'OPERATOR', _count: 2 },
    ]);

    const stats = await getTeamStats(tenantId);
    expect(stats.total).toBe(5);
    expect(stats.active).toBe(4);
    expect(stats.inactive).toBe(1);
    expect(stats.byRole.OWNER).toBe(1);
  });
});
