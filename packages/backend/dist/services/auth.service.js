"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.refresh = refresh;
exports.logout = logout;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
const jwt_js_1 = require("../lib/jwt.js");
const two_factor_service_js_1 = require("./two-factor.service.js");
const email_js_1 = require("../lib/email.js");
const admin_service_js_1 = require("./admin.service.js");
const zod_1 = require("zod");
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('E-mail inválido').optional(),
    password: zod_1.z.string().min(8, 'Senha deve ter no mínimo 8 caracteres')
        .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
        .regex(/[0-9]/, 'Senha deve conter ao menos um número')
        .regex(/[^A-Za-z0-9]/, 'Senha deve conter ao menos um caractere especial')
        .optional(),
    twoFactorToken: zod_1.z.string().optional(),
    tempToken: zod_1.z.string().optional(),
});
const registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    email: zod_1.z.string().email('E-mail inválido'),
    password: zod_1.z.string().min(8, 'Senha deve ter no mínimo 8 caracteres')
        .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
        .regex(/[0-9]/, 'Senha deve conter ao menos um número')
        .regex(/[^A-Za-z0-9]/, 'Senha deve conter ao menos um caractere especial'),
    tenantName: zod_1.z.string().min(2, 'Nome da empresa deve ter no mínimo 2 caracteres'),
    tenantSlug: zod_1.z
        .string()
        .min(2)
        .max(20)
        .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
});
const SALT_ROUNDS = 12;
let _dummyHash = null;
async function getDummyHash() {
    if (!_dummyHash)
        _dummyHash = await bcryptjs_1.default.hash('timing-attack-prevention-dummy', SALT_ROUNDS);
    return _dummyHash;
}
async function register(data) {
    const { name, email, password, tenantName, tenantSlug } = registerSchema.parse(data);
    const existingUser = await prisma_js_1.default.user.findUnique({ where: { email } });
    if (existingUser) {
        throw new errors_js_1.ConflictError('E-mail já cadastrado');
    }
    const existingSlug = await prisma_js_1.default.tenant.findUnique({ where: { slug: tenantSlug } });
    if (existingSlug) {
        throw new errors_js_1.ConflictError('Slug da empresa já está em uso');
    }
    const passwordHash = await bcryptjs_1.default.hash(password, SALT_ROUNDS);
    const tenant = await prisma_js_1.default.tenant.create({
        data: {
            name: tenantName,
            slug: tenantSlug,
            plan: 'FREE',
            maxAgents: 1,
            maxConversations: 100,
            maxWhatsapp: 1,
            maxAiRequests: 500,
            users: {
                create: {
                    email,
                    name,
                    passwordHash,
                    role: 'OWNER',
                    isActive: true,
                    emailVerified: false,
                },
            },
        },
        include: { users: true },
    });
    const user = tenant.users[0];
    // Seed default permissions for this tenant
    try {
        await (0, admin_service_js_1.seedDefaultPermissions)(tenant.id);
    }
    catch { /* non-critical */ }
    // Send welcome email (non-blocking)
    (0, email_js_1.sendWelcomeEmail)(user.email, user.name, tenant.name).catch(() => { });
    const accessToken = (0, jwt_js_1.signAccessToken)({
        sub: user.id,
        email: user.email,
        tenantId: tenant.id,
        role: user.role,
        plan: tenant.plan,
    });
    const refreshToken = (0, jwt_js_1.signRefreshToken)({ sub: user.id, tenantId: tenant.id });
    await prisma_js_1.default.refreshToken.create({
        data: {
            userId: user.id,
            tenantId: tenant.id,
            token: refreshToken,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
    });
    return {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
        accessToken,
        refreshToken,
    };
}
async function login(data) {
    const { email, password, twoFactorToken, tempToken } = loginSchema.parse(data);
    // Step 2: 2FA completion with tempToken
    if (tempToken && twoFactorToken) {
        let payload;
        try {
            payload = (0, jwt_js_1.verify2FATempToken)(tempToken);
        }
        catch {
            throw new errors_js_1.UnauthorizedError('Token 2FA expirado — faça login novamente');
        }
        const user = await prisma_js_1.default.user.findUnique({
            where: { id: payload.sub },
            include: { tenant: true },
        });
        if (!user || !user.isActive)
            throw new errors_js_1.UnauthorizedError('Usuário não encontrado ou inativo');
        const valid2FA = await (0, two_factor_service_js_1.verify2FAToken)(user.id, twoFactorToken);
        if (!valid2FA)
            throw new errors_js_1.UnauthorizedError('Código 2FA inválido');
        const accessToken = (0, jwt_js_1.signAccessToken)({
            sub: user.id, email: user.email, tenantId: user.tenantId, role: user.role, plan: user.tenant.plan,
        });
        const refreshToken = (0, jwt_js_1.signRefreshToken)({ sub: user.id, tenantId: user.tenantId });
        await prisma_js_1.default.refreshToken.create({
            data: { userId: user.id, tenantId: user.tenantId, token: refreshToken, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        });
        return {
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
            tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, plan: user.tenant.plan },
            accessToken, refreshToken,
        };
    }
    // Step 1: Normal login
    if (!email || !password)
        throw new errors_js_1.ValidationError('Email e senha são obrigatórios');
    const user = await prisma_js_1.default.user.findUnique({
        where: { email },
        include: { tenant: true },
    });
    if (!user || !user.isActive) {
        await bcryptjs_1.default.compare(password, await getDummyHash());
        throw new errors_js_1.UnauthorizedError('Credenciais inválidas');
    }
    const validPassword = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!validPassword) {
        throw new errors_js_1.UnauthorizedError('Credenciais inválidas');
    }
    if (user.twoFactorEnabled) {
        if (!twoFactorToken) {
            const tempToken = (0, jwt_js_1.sign2FATempToken)({ sub: user.id, tenantId: user.tenantId });
            return {
                requiresTwoFactor: true,
                tempToken,
            };
        }
        const valid2FA = await (0, two_factor_service_js_1.verify2FAToken)(user.id, twoFactorToken);
        if (!valid2FA) {
            throw new errors_js_1.UnauthorizedError('Código 2FA inválido');
        }
    }
    const accessToken = (0, jwt_js_1.signAccessToken)({
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        plan: user.tenant.plan,
    });
    const refreshToken = (0, jwt_js_1.signRefreshToken)({ sub: user.id, tenantId: user.tenantId });
    await prisma_js_1.default.refreshToken.create({
        data: {
            userId: user.id,
            tenantId: user.tenantId,
            token: refreshToken,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
    });
    return {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, plan: user.tenant.plan },
        accessToken,
        refreshToken,
    };
}
async function refresh(token) {
    const payload = (0, jwt_js_1.verifyRefreshToken)(token);
    const storedToken = await prisma_js_1.default.refreshToken.findUnique({ where: { token } });
    if (!storedToken || storedToken.expiresAt < new Date()) {
        throw new errors_js_1.UnauthorizedError('Refresh token inválido ou expirado');
    }
    await prisma_js_1.default.refreshToken.delete({ where: { id: storedToken.id } });
    const user = await prisma_js_1.default.user.findUnique({
        where: { id: payload.sub },
        include: { tenant: true },
    });
    if (!user || !user.isActive) {
        throw new errors_js_1.UnauthorizedError('Usuário não encontrado ou inativo');
    }
    const newAccessToken = (0, jwt_js_1.signAccessToken)({
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        plan: user.tenant.plan,
    });
    const newRefreshToken = (0, jwt_js_1.signRefreshToken)({ sub: user.id, tenantId: user.tenantId });
    await prisma_js_1.default.refreshToken.create({
        data: {
            userId: user.id,
            tenantId: user.tenantId,
            token: newRefreshToken,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
    });
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}
async function logout(token) {
    await prisma_js_1.default.refreshToken.deleteMany({ where: { token } });
}
//# sourceMappingURL=auth.service.js.map