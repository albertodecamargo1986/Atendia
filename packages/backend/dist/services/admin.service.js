"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardStats = getDashboardStats;
exports.listTenants = listTenants;
exports.getTenant = getTenant;
exports.updateTenant = updateTenant;
exports.listLicenses = listLicenses;
exports.createLicense = createLicense;
exports.revokeLicense = revokeLicense;
exports.listPayments = listPayments;
exports.getSystemSettings = getSystemSettings;
exports.listCustomers = listCustomers;
exports.getPermissions = getPermissions;
exports.upsertPermission = upsertPermission;
exports.seedDefaultPermissions = seedDefaultPermissions;
exports.adminListUsers = adminListUsers;
exports.adminCreateUser = adminCreateUser;
exports.adminDeleteUser = adminDeleteUser;
exports.adminResetPassword = adminResetPassword;
exports.listCoupons = listCoupons;
exports.createCoupon = createCoupon;
exports.toggleCouponStatus = toggleCouponStatus;
exports.deleteCoupon = deleteCoupon;
exports.extendTrial = extendTrial;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const online_service_js_1 = require("./online.service.js");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const SALT_ROUNDS = 12;
/* ── Dashboard ── */
async function getDashboardStats() {
    const [tenants, activeTenants, licenses, activeLicenses, payments, totalRevenue, usersTotal, conversationsTotal, onlineCount] = await Promise.all([
        prisma_js_1.default.tenant.count(),
        prisma_js_1.default.tenant.count({ where: { isActive: true } }),
        prisma_js_1.default.license.count(),
        prisma_js_1.default.license.count({ where: { status: 'ACTIVE' } }),
        prisma_js_1.default.payment.count(),
        prisma_js_1.default.payment.aggregate({ _sum: { amount: true }, where: { status: 'APPROVED' } }),
        prisma_js_1.default.user.count(),
        prisma_js_1.default.conversation.count(),
        (0, online_service_js_1.getOnlineCount)(),
    ]);
    const planDistribution = await prisma_js_1.default.tenant.groupBy({
        by: ['plan'],
        _count: true,
    });
    const recentTenants = await prisma_js_1.default.tenant.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, slug: true, plan: true, isActive: true, createdAt: true, _count: { select: { users: true } } },
    });
    const recentPayments = await prisma_js_1.default.payment.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true, email: true } } },
    });
    // Métricas mensais (últimos 12 meses)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const monthlyRevenue = await prisma_js_1.default.payment.groupBy({
        by: ['createdAt'],
        where: {
            status: 'APPROVED',
            createdAt: { gte: twelveMonthsAgo },
        },
        _sum: { amount: true },
    });
    const monthlyTenants = await prisma_js_1.default.tenant.groupBy({
        by: ['createdAt'],
        where: {
            createdAt: { gte: twelveMonthsAgo },
        },
        _count: true,
    });
    // Top tenants por conversas
    const topTenants = await prisma_js_1.default.tenant.findMany({
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
async function listTenants(page = 1, limit = 20, search) {
    const where = {};
    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
        ];
    }
    const [tenants, total] = await Promise.all([
        prisma_js_1.default.tenant.findMany({
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
        prisma_js_1.default.tenant.count({ where }),
    ]);
    return { tenants, total, page, limit, totalPages: Math.ceil(total / limit) };
}
async function getTenant(id) {
    return prisma_js_1.default.tenant.findUniqueOrThrow({
        where: { id },
        include: {
            _count: { select: { users: true, agents: true, conversations: true, contacts: true, tickets: true } },
            subscription: true,
            users: { select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } },
        },
    });
}
async function updateTenant(id, data) {
    return prisma_js_1.default.tenant.update({ where: { id }, data: data });
}
/* ── Licenses ── */
async function listLicenses(page = 1, limit = 20, search) {
    const where = {};
    if (search) {
        where.OR = [
            { serial: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { customer: { email: { contains: search, mode: 'insensitive' } } },
        ];
    }
    const [licenses, total] = await Promise.all([
        prisma_js_1.default.license.findMany({
            where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
            include: { customer: { select: { id: true, name: true, email: true } } },
        }),
        prisma_js_1.default.license.count({ where }),
    ]);
    return { licenses, total, page, limit, totalPages: Math.ceil(total / limit) };
}
async function createLicense(data) {
    const serial = `LIC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    return prisma_js_1.default.license.create({
        data: {
            customerId: data.customerId,
            serial,
            plan: data.plan,
            status: 'INACTIVE',
            expiresAt: new Date(data.expiresAt),
        },
    });
}
async function revokeLicense(id) {
    return prisma_js_1.default.license.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date() } });
}
/* ── Payments ── */
async function listPayments(page = 1, limit = 20) {
    const [payments, total] = await Promise.all([
        prisma_js_1.default.payment.findMany({
            skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
            include: { customer: { select: { id: true, name: true, email: true } }, license: { select: { serial: true } } },
        }),
        prisma_js_1.default.payment.count(),
    ]);
    return { payments, total, page, limit, totalPages: Math.ceil(total / limit) };
}
/* ── System Settings ── */
async function getSystemSettings() {
    const [tenantsCount, planDistribution] = await Promise.all([
        prisma_js_1.default.tenant.count(),
        prisma_js_1.default.tenant.groupBy({ by: ['plan'], _count: true }),
    ]);
    return { tenantsCount, planDistribution };
}
/* ── Customers ── */
async function listCustomers(search) {
    const where = {};
    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { cpfCnpj: { contains: search } },
        ];
    }
    return prisma_js_1.default.customer.findMany({
        where, orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true, cpfCnpj: true, phone: true, createdAt: true },
    });
}
/* ── Permissions ── */
async function getPermissions(tenantId) {
    const permissions = await prisma_js_1.default.permission.findMany({ where: { tenantId } });
    return permissions;
}
async function upsertPermission(data) {
    return prisma_js_1.default.permission.upsert({
        where: { tenantId_role_module: { tenantId: data.tenantId, role: data.role, module: data.module } },
        create: data,
        update: { canRead: data.canRead, canWrite: data.canWrite, canDelete: data.canDelete },
    });
}
async function seedDefaultPermissions(tenantId) {
    const modules = ['dashboard', 'tickets', 'conversations', 'contacts', 'agents', 'queues', 'tags',
        'quickReplies', 'campaigns', 'voiceProfiles', 'webhooks', 'reports', 'internalChat',
        'knowledge', 'whatsapp', 'businessHours', 'team', 'license', 'settings', 'admin'];
    const defaults = {
        OWNER: { canRead: true, canWrite: true, canDelete: true },
        ADMIN: { canRead: true, canWrite: true, canDelete: true },
        SUPERVISOR: { canRead: true, canWrite: true, canDelete: false },
        OPERATOR: { canRead: true, canWrite: false, canDelete: false },
    };
    for (const role of ['OWNER', 'ADMIN', 'SUPERVISOR', 'OPERATOR']) {
        for (const module of modules) {
            const perms = defaults[role];
            await prisma_js_1.default.permission.upsert({
                where: { tenantId_role_module: { tenantId, role, module } },
                create: { tenantId, role, module, ...perms },
                update: { ...perms },
            });
        }
    }
}
/* ── Users Management ── */
async function adminListUsers(tenantId) {
    return prisma_js_1.default.user.findMany({
        where: { tenantId },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
    });
}
async function adminCreateUser(tenantId, data) {
    const existing = await prisma_js_1.default.user.findUnique({ where: { email: data.email } });
    if (existing)
        throw new Error('Email já cadastrado');
    const passwordHash = await bcryptjs_1.default.hash(data.password, SALT_ROUNDS);
    return prisma_js_1.default.user.create({
        data: {
            tenantId,
            name: data.name,
            email: data.email,
            passwordHash,
            role: data.role || 'OPERATOR',
        },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
}
async function adminDeleteUser(userId) {
    const user = await prisma_js_1.default.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role === 'OWNER')
        throw new Error('Não é possível deletar o OWNER do tenant');
    await prisma_js_1.default.user.delete({ where: { id: userId } });
    return { message: 'Usuário deletado com sucesso' };
}
async function adminResetPassword(userId, newPassword) {
    const passwordHash = await bcryptjs_1.default.hash(newPassword, SALT_ROUNDS);
    await prisma_js_1.default.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Senha redefinida com sucesso' };
}
/* ── Coupons ── */
async function listCoupons() {
    return prisma_js_1.default.coupon.findMany({
        orderBy: { createdAt: 'desc' },
        include: { tenant: { select: { name: true } } },
    });
}
async function createCoupon(data) {
    return prisma_js_1.default.coupon.create({
        data: {
            code: data.code.toUpperCase(),
            discount: data.discount,
            plan: data.plan,
            maxUses: data.maxUses || 1,
            expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
            tenantId: data.tenantId || null,
        },
    });
}
async function toggleCouponStatus(id) {
    const coupon = await prisma_js_1.default.coupon.findUniqueOrThrow({ where: { id } });
    return prisma_js_1.default.coupon.update({ where: { id }, data: { isActive: !coupon.isActive } });
}
async function deleteCoupon(id) {
    await prisma_js_1.default.coupon.delete({ where: { id } });
    return { message: 'Cupom deletado com sucesso' };
}
/* ── Trial Extension ── */
async function extendTrial(tenantId, days) {
    const tenant = await prisma_js_1.default.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const trialEndAt = tenant.trialEndAt
        ? new Date(tenant.trialEndAt.getTime() + days * 86400000)
        : new Date(Date.now() + days * 86400000);
    return prisma_js_1.default.tenant.update({
        where: { id: tenantId },
        data: { trialEndAt, trialUsed: true },
    });
}
//# sourceMappingURL=admin.service.js.map