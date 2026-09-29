import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import prisma from '../lib/prisma.js';
import { UnauthorizedError, ConflictError, ValidationError } from '../lib/errors.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, sign2FATempToken, verify2FATempToken } from '../lib/jwt.js';
import { verify2FAToken } from './two-factor.service.js';
import { sendWelcomeEmail } from '../lib/email.js';
import { seedDefaultPermissions } from './admin.service.js';
import { passwordSchema } from '../lib/password.js';
import { z } from 'zod';

/**
 * Login NÃO valida força de senha — só exige que algo tenha sido digitado.
 * (Senhas antigas mais fracas precisam continuar funcionando.)
 */
export const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido').optional(),
  password: z.string().min(1, 'Informe a senha').optional(),
  twoFactorToken: z.string().optional(),
  tempToken: z.string().optional(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: passwordSchema,
  tenantName: z.string().trim().min(2, 'Nome da empresa deve ter no mínimo 2 caracteres'),
  // Opcional: se ausente, é gerado automaticamente a partir do nome da empresa
  tenantSlug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Identificador deve conter apenas letras minúsculas, números e hífens')
    .optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;

const SALT_ROUNDS = 12;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let _dummyHash: string | null = null;
async function getDummyHash() {
  if (!_dummyHash) _dummyHash = await bcrypt.hash('timing-attack-prevention-dummy', SALT_ROUNDS);
  return _dummyHash;
}

/** Gera um slug a partir do nome (sem acentos, minúsculo, com hífens). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'empresa';
}

async function generateUniqueSlug(tenantName: string): Promise<string> {
  const base = slugify(tenantName);
  const existing = await prisma.tenant.findUnique({ where: { slug: base } });
  if (!existing) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${randomBytes(3).toString('hex')}`;
    const taken = await prisma.tenant.findUnique({ where: { slug: candidate } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function issueTokens(user: { id: string; email: string; tenantId: string; role: string }, plan: string) {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
    plan,
  });
  const refreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenantId });
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      token: refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { accessToken, refreshToken };
}

function publicTenant(tenant: { id: string; name: string; slug: string; plan: string; onboardingCompletedAt?: Date | null }) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan,
    onboardingCompletedAt: tenant.onboardingCompletedAt ?? null,
  };
}

export async function register(data: RegisterInput) {
  const { name, email, password, tenantName, tenantSlug } = registerSchema.parse(data);

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new ConflictError('E-mail já cadastrado');
  }

  let slug: string;
  if (tenantSlug) {
    const existingSlug = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (existingSlug) {
      throw new ConflictError('Identificador da empresa já está em uso');
    }
    slug = tenantSlug;
  } else {
    slug = await generateUniqueSlug(tenantName);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Cadastro público sempre cria o OWNER de um tenant novo (nunca SUPER_ADMIN)
  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      slug,
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

  try { await seedDefaultPermissions(tenant.id); } catch { /* não crítico */ }

  sendWelcomeEmail(user.email, user.name, tenant.name).catch(() => {});

  const tokens = await issueTokens(user, tenant.plan);

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: publicTenant(tenant),
    ...tokens,
  };
}

export async function login(data: LoginInput) {
  const { email, password, twoFactorToken, tempToken } = loginSchema.parse(data);

  // Etapa 2: conclusão do 2FA com tempToken
  if (tempToken && twoFactorToken) {
    let payload: { sub: string; tenantId: string };
    try {
      payload = verify2FATempToken(tempToken);
    } catch {
      throw new UnauthorizedError('Código de verificação expirado — faça login novamente');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedError('Usuário não encontrado ou inativo');

    const valid2FA = await verify2FAToken(user.id, twoFactorToken);
    if (!valid2FA) throw new UnauthorizedError('Código 2FA inválido');

    const tokens = await issueTokens(user, user.tenant.plan);
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: publicTenant(user.tenant),
      ...tokens,
    };
  }

  // Etapa 1: login normal
  if (!email || !password) throw new ValidationError('E-mail e senha são obrigatórios');

  // Busca pelo e-mail como digitado e, se não achar, em minúsculas
  // (cadastros novos são gravados em minúsculas; antigos podem ter maiúsculas)
  const user =
    (await prisma.user.findUnique({ where: { email }, include: { tenant: true } })) ??
    (email !== email.toLowerCase()
      ? await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { tenant: true } })
      : null);

  if (!user || !user.isActive) {
    await bcrypt.compare(password, await getDummyHash());
    throw new UnauthorizedError('E-mail ou senha incorretos');
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    throw new UnauthorizedError('E-mail ou senha incorretos');
  }

  if (user.twoFactorEnabled) {
    if (!twoFactorToken) {
      const temp = sign2FATempToken({ sub: user.id, tenantId: user.tenantId });
      return {
        requiresTwoFactor: true,
        tempToken: temp,
      } as any;
    }
    const valid2FA = await verify2FAToken(user.id, twoFactorToken);
    if (!valid2FA) {
      throw new UnauthorizedError('Código 2FA inválido');
    }
  }

  const tokens = await issueTokens(user, user.tenant.plan);

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: publicTenant(user.tenant),
    ...tokens,
  };
}

export async function refresh(token: string) {
  let payload: { sub: string; tenantId: string };
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new UnauthorizedError('Refresh token inválido ou expirado');
  }

  // Transação: apaga o token antigo e cria o novo atomicamente.
  // Se duas requisições concorrentes usarem o mesmo token, só a primeira
  // consegue apagá-lo (count === 1); a outra recebe 401.
  return prisma.$transaction(async (tx) => {
    const storedToken = await tx.refreshToken.findUnique({ where: { token } });
    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token inválido ou expirado');
    }

    const deleted = await tx.refreshToken.deleteMany({ where: { token } });
    if (!deleted || deleted.count === 0) {
      throw new UnauthorizedError('Refresh token já utilizado');
    }

    const user = await tx.user.findUnique({
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

    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  });
}

export async function logout(token: string) {
  await prisma.refreshToken.deleteMany({ where: { token } });
}

/** Dados do usuário logado, com plano lido do BANCO (não do JWT). */
export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      tenantId: true,
      isActive: true,
      twoFactorEnabled: true,
      tenant: { select: { id: true, name: true, slug: true, plan: true, onboardingCompletedAt: true } },
    },
  });
  if (!user || !user.isActive) throw new UnauthorizedError('Usuário não encontrado ou inativo');
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    twoFactorEnabled: user.twoFactorEnabled,
    // Campos legados (mantidos para compatibilidade com o frontend atual)
    sub: user.id,
    plan: user.tenant.plan,
    tenantName: user.tenant.name,
    tenantSlug: user.tenant.slug,
    tenant: publicTenant(user.tenant),
  };
}
