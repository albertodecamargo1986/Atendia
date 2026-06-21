import prisma from '../lib/prisma.js';
import { getOnlineCount } from './online.service.js';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/* ── Dashboard ── */
export async function getDashboardStats() {
  const [tenants, activeTenants, licenses, activeLicenses, payments, totalRevenue, usersTotal, conversationsTotal, onlineCount] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { isActive: true } }),
    prisma.license.count(),
    prisma.license.count({ where: { status: 'ACTIVE' } }),
    prisma.payment.count(),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'APPROVED' } }),
    prisma.user.count(),
    prisma.conversation.count(),
    getOnlineCount(),
  ]);

  const planDistribution = await prisma.tenant.groupBy({
    by: ['plan'],
    _count: true,
  });

  const recentTenants = await prisma.tenant.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, slug: true, plan: true, isActive: true, createdAt: true, _count: { select: { users: true } } },
  });

  const recentPayments = await prisma.payment.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: { customer: { select: { name: true, email: true } } },
  });

  // Métricas mensais (últimos 12 meses)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const monthlyRevenue = await prisma.payment.groupBy({
    by: ['createdAt'],
    where: {
      status: 'APPROVED',
      createdAt: { gte: twelveMonthsAgo },
    },
    _sum: { amount: true },
  });

  const monthlyTenants = await prisma.tenant.groupBy({
    by: ['createdAt'],
    where: {
      createdAt: { gte: twelveMonthsAgo },
    },
    _count: true,
  });

  // Top tenants por conversas
  const topTenants = await prisma.tenant.findMany({
    take: 10,
    orderBy: { conversations: { _count: 'desc' } },
    select: {
      id: true, name: true, plan: true,
      _count: { select: { conversations: true, users: true, agents: true } },
    },
  });

  return {
    tenants: { total: tenants, active: activeTenants },
    licenses: { total: licenses, active: activeLicenses },
    payments: { total: payments, totalRevenue: totalRevenue._sum.amount || 0 },
    users: { total: usersTotal },
    conversations: { total: conversationsTotal },
    online: { count: onlineCount },
    planDistribution: planDistribution.map(p => ({ plan: p.plan, count: p._count })),
    recentTenants,
    recentPayments,
    monthlyRevenue: monthlyRevenue.map(r => ({ date: r.createdAt, amount: r._sum.amount || 0 })),
    monthlyTenants: monthlyTenants.map(r => ({ date: r.createdAt, count: r._count })),
    topTenants,
  };
}

/* ── Tenants ── */
export async function listTenants(page = 1, limit = 20, search?: string) {
  const where: any = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, slug: true, plan: true, isActive: true,
        maxAgents: true, maxConversations: true, maxWhatsapp: true, maxAiRequests: true,
        createdAt: true, updatedAt: true,
        _count: { select: { users: true, agents: true, conversations: true } },
        subscription: { select: { status: true, currentPeriodEnd: true } },
      },
    }),
    prisma.tenant.count({ where }),
  ]);
  return { tenants, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getTenant(id: string) {
  return prisma.tenant.findUniqueOrThrow({
    where: { id },
    include: {
      _count: { select: { users: true, agents: true, conversations: true, contacts: true, tickets: true } },
      subscription: true,
      users: { select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } },
    },
  });
}

export async function updateTenant(id: string, data: {
  name?: string; plan?: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE'; isActive?: boolean;
  maxAgents?: number; maxConversations?: number; maxWhatsapp?: number; maxAiRequests?: number;
}) {
  return prisma.tenant.update({ where: { id }, data: data as any });
}

/* ── Licenses ── */
export async function listLicenses(page = 1, limit = 20, search?: string) {
  const where: any = {};
  if (search) {
    where.OR = [
      { serial: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
      { customer: { email: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const [licenses, total] = await Promise.all([
    prisma.license.findMany({
      where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, name: true, email: true } } },
    }),
    prisma.license.count({ where }),
  ]);
  return { licenses, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function createLicense(data: {
  customerId: string; plan: string; expiresAt: string;
}) {
  const serial = `LIC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  return prisma.license.create({
    data: {
      customerId: data.customerId,
      serial,
      plan: data.plan as any,
      status: 'INACTIVE',
      expiresAt: new Date(data.expiresAt),
    },
  });
}

export async function revokeLicense(id: string) {
  return prisma.license.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date() } });
}

/* ── Payments ── */
export async function listPayments(page = 1, limit = 20) {
  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, name: true, email: true } }, license: { select: { serial: true } } },
    }),
    prisma.payment.count(),
  ]);
  return { payments, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/* ── System Settings ── */
export async function getSystemSettings() {
  const [tenantsCount, planDistribution] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.groupBy({ by: ['plan'], _count: true }),
  ]);
  return { tenantsCount, planDistribution };
}

/* ── Customers ── */
export async function listCustomers(search?: string) {
  const where: any = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { cpfCnpj: { contains: search } },
    ];
  }
  return prisma.customer.findMany({
    where, orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, cpfCnpj: true, phone: true, createdAt: true },
  });
}

/* ── Permissions ── */
export async function getPermissions(tenantId: string) {
  const permissions = await prisma.permission.findMany({ where: { tenantId } });
  return permissions;
}

export async function upsertPermission(data: {
  tenantId: string; role: string; module: string;
  canRead: boolean; canWrite: boolean; canDelete: boolean;
}) {
  return prisma.permission.upsert({
    where: { tenantId_role_module: { tenantId: data.tenantId, role: data.role as any, module: data.module } },
    create: data as any,
    update: { canRead: data.canRead, canWrite: data.canWrite, canDelete: data.canDelete },
  });
}

export async function seedDefaultPermissions(tenantId: string) {
  const modules = ['dashboard', 'tickets', 'conversations', 'contacts', 'agents', 'queues', 'tags',
    'quickReplies', 'campaigns', 'voiceProfiles', 'webhooks', 'reports', 'internalChat',
    'knowledge', 'whatsapp', 'businessHours', 'team', 'license', 'settings', 'admin'];

  const defaults: Record<string, { canRead: boolean; canWrite: boolean; canDelete: boolean }> = {
    OWNER: { canRead: true, canWrite: true, canDelete: true },
    ADMIN: { canRead: true, canWrite: true, canDelete: true },
    SUPERVISOR: { canRead: true, canWrite: true, canDelete: false },
    OPERATOR: { canRead: true, canWrite: false, canDelete: false },
  };

  for (const role of ['OWNER', 'ADMIN', 'SUPERVISOR', 'OPERATOR'] as const) {
    for (const module of modules) {
      const perms = defaults[role];
      await prisma.permission.upsert({
        where: { tenantId_role_module: { tenantId, role, module } },
        create: { tenantId, role, module, ...perms },
        update: { ...perms },
      });
    }
  }
}

/* ── Users Management ── */
export async function adminListUsers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function adminCreateUser(tenantId: string, data: { name: string; email: string; password: string; role?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error('Email já cadastrado');
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  return prisma.user.create({
    data: {
      tenantId,
      name: data.name,
      email: data.email,
      passwordHash,
      role: (data.role as any) || 'OPERATOR',
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
}

export async function adminDeleteUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.role === 'OWNER') throw new Error('Não é possível deletar o OWNER do tenant');
  await prisma.user.delete({ where: { id: userId } });
  return { message: 'Usuário deletado com sucesso' };
}

export async function adminResetPassword(userId: string, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { message: 'Senha redefinida com sucesso' };
}

/* ── Coupons ── */
export async function listCoupons() {
  return prisma.coupon.findMany({
    orderBy: { createdAt: 'desc' },
    include: { tenant: { select: { name: true } } },
  });
}

export async function createCoupon(data: {
  code: string; discount: number; plan: string; maxUses?: number; expiresAt?: string; tenantId?: string;
}) {
  return prisma.coupon.create({
    data: {
      code: data.code.toUpperCase(),
      discount: data.discount,
      plan: data.plan as any,
      maxUses: data.maxUses || 1,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      tenantId: data.tenantId || null,
    },
  });
}

export async function toggleCouponStatus(id: string) {
  const coupon = await prisma.coupon.findUniqueOrThrow({ where: { id } });
  return prisma.coupon.update({ where: { id }, data: { isActive: !coupon.isActive } });
}

export async function deleteCoupon(id: string) {
  await prisma.coupon.delete({ where: { id } });
  return { message: 'Cupom deletado com sucesso' };
}

/* ── Trial Extension ── */
export async function extendTrial(tenantId: string, days: number) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const trialEndAt = tenant.trialEndAt
    ? new Date(tenant.trialEndAt.getTime() + days * 86400000)
    : new Date(Date.now() + days * 86400000);
  return prisma.tenant.update({
    where: { id: tenantId },
    data: { trialEndAt, trialUsed: true },
  });
}
