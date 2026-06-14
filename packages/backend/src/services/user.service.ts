import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'OPERATOR']).default('OPERATOR'),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'OPERATOR']).optional(),
  isActive: z.boolean().optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').optional(),
  currentPassword: z.string().min(6).optional(),
  newPassword: z.string().min(6, 'Nova senha deve ter no mínimo 6 caracteres').optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

const SALT_ROUNDS = 12;

export async function listUsers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      avatarUrl: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { conversations: true, auditLogs: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getUser(tenantId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      avatarUrl: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { conversations: true, auditLogs: true } },
    },
  });
  if (!user) throw new NotFoundError('Usuário', userId);
  return user;
}

export async function createUser(tenantId: string, data: CreateUserInput, invitedBy: string) {
  const parsed = createUserSchema.parse(data);

  const existingUser = await prisma.user.findUnique({ where: { email: parsed.email } });
  if (existingUser) throw new ConflictError('E-mail já cadastrado');

  const passwordHash = await bcrypt.hash(parsed.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      tenantId,
      email: parsed.email,
      name: parsed.name,
      passwordHash,
      role: parsed.role,
      isActive: true,
      emailVerified: false,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      avatarUrl: true,
      emailVerified: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: invitedBy,
      action: 'INVITE_USER',
      entity: 'User',
      entityId: user.id,
      details: { email: parsed.email, role: parsed.role },
    },
  });

  return user;
}

export async function updateUser(tenantId: string, userId: string, data: UpdateUserInput, updatedBy: string) {
  const parsed = updateUserSchema.parse(data);

  const existing = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!existing) throw new NotFoundError('Usuário', userId);

  if (existing.role === 'OWNER') {
    throw new ForbiddenError('Não é possível alterar o cargo do owner');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: parsed,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      avatarUrl: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: updatedBy,
      action: 'UPDATE_USER',
      entity: 'User',
      entityId: userId,
      details: parsed,
    },
  });

  return user;
}

export async function toggleUserActive(tenantId: string, userId: string, deactivatedBy: string) {
  const existing = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!existing) throw new NotFoundError('Usuário', userId);

  if (existing.role === 'OWNER') throw new ForbiddenError('Não é possível desativar o owner');

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive: !existing.isActive },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: deactivatedBy,
      action: existing.isActive ? 'DEACTIVATE_USER' : 'ACTIVATE_USER',
      entity: 'User',
      entityId: userId,
    },
  });

  return user;
}

export async function deleteUser(tenantId: string, userId: string, deletedBy: string) {
  const existing = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!existing) throw new NotFoundError('Usuário', userId);

  if (existing.role === 'OWNER') throw new ForbiddenError('Não é possível deletar o owner');

  await prisma.refreshToken.deleteMany({ where: { userId } });

  const user = await prisma.user.delete({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: deletedBy,
      action: 'DELETE_USER',
      entity: 'User',
      entityId: userId,
      details: { email: existing.email },
    },
  });

  return user;
}

export async function updateProfile(userId: string, tenantId: string, data: UpdateProfileInput) {
  const parsed = updateProfileSchema.parse(data);
  const existing = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!existing) throw new NotFoundError('Usuário', userId);

  const updateData: { name?: string; passwordHash?: string } = {};

  if (parsed.name) updateData.name = parsed.name;

  if (parsed.currentPassword && parsed.newPassword) {
    const validPassword = await bcrypt.compare(parsed.currentPassword, existing.passwordHash);
    if (!validPassword) throw new UnauthorizedError('Senha atual incorreta');
    updateData.passwordHash = await bcrypt.hash(parsed.newPassword, SALT_ROUNDS);
  }

  if (Object.keys(updateData).length === 0) throw new ValidationError('Nenhum dado para atualizar');

  return prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: { id: true, name: true, email: true, role: true },
  });
}

export async function getTeamStats(tenantId: string) {
  const [total, active, byRole] = await Promise.all([
    prisma.user.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, isActive: true } }),
    prisma.user.groupBy({
      by: ['role'],
      where: { tenantId },
      _count: true,
    }),
  ]);

  return {
    total,
    active,
    inactive: total - active,
    byRole: byRole.reduce<Record<string, number>>((acc, r) => { acc[r.role] = r._count; return acc; }, {}),
  };
}
