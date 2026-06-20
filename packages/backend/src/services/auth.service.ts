import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { UnauthorizedError, ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, sign2FATempToken, verify2FATempToken } from '../lib/jwt.js';
import { verify2FAToken } from './two-factor.service.js';
import { sendWelcomeEmail } from '../lib/email.js';
import { seedDefaultPermissions } from './admin.service.js';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('E-mail inválido').optional(),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número')
    .regex(/[^A-Za-z0-9]/, 'Senha deve conter ao menos um caractere especial')
    .optional(),
  twoFactorToken: z.string().optional(),
  tempToken: z.string().optional(),
});

const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número')
    .regex(/[^A-Za-z0-9]/, 'Senha deve conter ao menos um caractere especial'),
  tenantName: z.string().min(2, 'Nome da empresa deve ter no mínimo 2 caracteres'),
  tenantSlug: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

const SALT_ROUNDS = 12;
let _dummyHash: string | null = null;
async function getDummyHash() {
  if (!_dummyHash) _dummyHash = await bcrypt.hash('timing-attack-prevention-dummy', SALT_ROUNDS);
  return _dummyHash;
}

export async function register(data: RegisterInput) {
  const { name, email, password, tenantName, tenantSlug } = registerSchema.parse(data);

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new ConflictError('E-mail já cadastrado');
  }

  const existingSlug = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (existingSlug) {
    throw new ConflictError('Slug da empresa já está em uso');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const tenant = await prisma.tenant.create({
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

  const user = tenant.users[0]!;

  // Seed default permissions for this tenant
  try { await seedDefaultPermissions(tenant.id); } catch { /* non-critical */ }

  // Send welcome email (non-blocking)
  sendWelcomeEmail(user.email, user.name, tenant.name).catch(() => {});

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    tenantId: tenant.id,
    role: user.role,
    plan: tenant.plan,
  });

  const refreshToken = signRefreshToken({ sub: user.id, tenantId: tenant.id });

  await prisma.refreshToken.create({
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

export async function login(data: LoginInput) {
  const { email, password, twoFactorToken, tempToken } = loginSchema.parse(data);

  // Step 2: 2FA completion with tempToken
  if (tempToken && twoFactorToken) {
    let payload: { sub: string; tenantId: string };
    try {
      payload = verify2FATempToken(tempToken);
    } catch {
      throw new UnauthorizedError('Token 2FA expirado — faça login novamente');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedError('Usuário não encontrado ou inativo');

    const valid2FA = await verify2FAToken(user.id, twoFactorToken);
    if (!valid2FA) throw new UnauthorizedError('Código 2FA inválido');

    const accessToken = signAccessToken({
      sub: user.id, email: user.email, tenantId: user.tenantId, role: user.role, plan: user.tenant.plan,
    });
    const refreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenantId });
    await prisma.refreshToken.create({
      data: { userId: user.id, tenantId: user.tenantId, token: refreshToken, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, plan: user.tenant.plan },
      accessToken, refreshToken,
    };
  }

  // Step 1: Normal login
  if (!email || !password) throw new ValidationError('Email e senha são obrigatórios');

  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: true },
  });

  if (!user || !user.isActive) {
    await bcrypt.compare(password, await getDummyHash());
    throw new UnauthorizedError('Credenciais inválidas');
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    throw new UnauthorizedError('Credenciais inválidas');
  }

  if (user.twoFactorEnabled) {
    if (!twoFactorToken) {
      const tempToken = sign2FATempToken({ sub: user.id, tenantId: user.tenantId });
      return {
        requiresTwoFactor: true,
        tempToken,
      } as any;
    }
    const valid2FA = await verify2FAToken(user.id, twoFactorToken);
    if (!valid2FA) {
      throw new UnauthorizedError('Código 2FA inválido');
    }
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
    plan: user.tenant.plan,
  });

  const refreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenantId });

  await prisma.refreshToken.create({
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

export async function refresh(token: string) {
  const payload = verifyRefreshToken(token);

  const storedToken = await prisma.refreshToken.findUnique({ where: { token } });
  if (!storedToken || storedToken.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token inválido ou expirado');
  }

  await prisma.refreshToken.delete({ where: { id: storedToken.id } });

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { tenant: true },
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedError('Usuário não encontrado ou inativo');
  }

  const newAccessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
    plan: user.tenant.plan,
  });

  const newRefreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenantId });

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(token: string) {
  await prisma.refreshToken.deleteMany({ where: { token } });
}
