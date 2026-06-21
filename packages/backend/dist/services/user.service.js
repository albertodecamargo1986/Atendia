"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUsers = listUsers;
exports.getUser = getUser;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.toggleUserActive = toggleUserActive;
exports.deleteUser = deleteUser;
exports.updateProfile = updateProfile;
exports.getTeamStats = getTeamStats;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const errors_js_1 = require("../lib/errors.js");
const zod_1 = require("zod");
const createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    email: zod_1.z.string().email('E-mail inválido'),
    password: zod_1.z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
    role: zod_1.z.enum(['ADMIN', 'SUPERVISOR', 'OPERATOR']).default('OPERATOR'),
});
const updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    role: zod_1.z.enum(['ADMIN', 'SUPERVISOR', 'OPERATOR']).optional(),
    isActive: zod_1.z.boolean().optional(),
});
const updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').optional(),
    currentPassword: zod_1.z.string().min(6).optional(),
    newPassword: zod_1.z.string().min(6, 'Nova senha deve ter no mínimo 6 caracteres').optional(),
});
const SALT_ROUNDS = 12;
async function listUsers(tenantId) {
    return prisma_js_1.default.user.findMany({
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
async function getUser(tenantId, userId) {
    const user = await prisma_js_1.default.user.findFirst({
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
    if (!user)
        throw new errors_js_1.NotFoundError('Usuário', userId);
    return user;
}
async function createUser(tenantId, data, invitedBy) {
    const parsed = createUserSchema.parse(data);
    const existingUser = await prisma_js_1.default.user.findUnique({ where: { email: parsed.email } });
    if (existingUser)
        throw new errors_js_1.ConflictError('E-mail já cadastrado');
    const passwordHash = await bcryptjs_1.default.hash(parsed.password, SALT_ROUNDS);
    const user = await prisma_js_1.default.user.create({
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
    await prisma_js_1.default.auditLog.create({
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
async function updateUser(tenantId, userId, data, updatedBy) {
    const parsed = updateUserSchema.parse(data);
    const existing = await prisma_js_1.default.user.findFirst({ where: { id: userId, tenantId } });
    if (!existing)
        throw new errors_js_1.NotFoundError('Usuário', userId);
    if (existing.role === 'OWNER') {
        throw new errors_js_1.ForbiddenError('Não é possível alterar o cargo do owner');
    }
    const user = await prisma_js_1.default.user.update({
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
    await prisma_js_1.default.auditLog.create({
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
async function toggleUserActive(tenantId, userId, deactivatedBy) {
    const existing = await prisma_js_1.default.user.findFirst({ where: { id: userId, tenantId } });
    if (!existing)
        throw new errors_js_1.NotFoundError('Usuário', userId);
    if (existing.role === 'OWNER')
        throw new errors_js_1.ForbiddenError('Não é possível desativar o owner');
    const user = await prisma_js_1.default.user.update({
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
    await prisma_js_1.default.auditLog.create({
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
async function deleteUser(tenantId, userId, deletedBy) {
    const existing = await prisma_js_1.default.user.findFirst({ where: { id: userId, tenantId } });
    if (!existing)
        throw new errors_js_1.NotFoundError('Usuário', userId);
    if (existing.role === 'OWNER')
        throw new errors_js_1.ForbiddenError('Não é possível deletar o owner');
    await prisma_js_1.default.refreshToken.deleteMany({ where: { userId } });
    const user = await prisma_js_1.default.user.delete({
        where: { id: userId },
        select: { id: true, name: true, email: true },
    });
    await prisma_js_1.default.auditLog.create({
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
async function updateProfile(userId, tenantId, data) {
    const parsed = updateProfileSchema.parse(data);
    const existing = await prisma_js_1.default.user.findFirst({ where: { id: userId, tenantId } });
    if (!existing)
        throw new errors_js_1.NotFoundError('Usuário', userId);
    const updateData = {};
    if (parsed.name)
        updateData.name = parsed.name;
    if (parsed.currentPassword && parsed.newPassword) {
        const validPassword = await bcryptjs_1.default.compare(parsed.currentPassword, existing.passwordHash);
        if (!validPassword)
            throw new errors_js_1.UnauthorizedError('Senha atual incorreta');
        updateData.passwordHash = await bcryptjs_1.default.hash(parsed.newPassword, SALT_ROUNDS);
    }
    if (Object.keys(updateData).length === 0)
        throw new errors_js_1.ValidationError('Nenhum dado para atualizar');
    return prisma_js_1.default.user.update({
        where: { id: userId },
        data: updateData,
        select: { id: true, name: true, email: true, role: true },
    });
}
async function getTeamStats(tenantId) {
    const [total, active, byRole] = await Promise.all([
        prisma_js_1.default.user.count({ where: { tenantId } }),
        prisma_js_1.default.user.count({ where: { tenantId, isActive: true } }),
        prisma_js_1.default.user.groupBy({
            by: ['role'],
            where: { tenantId },
            _count: true,
        }),
    ]);
    return {
        total,
        active,
        inactive: total - active,
        byRole: byRole.reduce((acc, r) => { acc[r.role] = r._count; return acc; }, {}),
    };
}
//# sourceMappingURL=user.service.js.map