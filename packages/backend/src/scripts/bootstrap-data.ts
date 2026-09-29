/**
 * Dados iniciais da plataforma, compartilhados entre o seed (prisma/seed.ts)
 * e o script create-admin (usado pelo instalador). Tudo idempotente.
 */
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { passwordSchema } from '../lib/password.js';

const SALT_ROUNDS = 12;

const DEFAULT_PLANS = [
  {
    planId: 'FREE' as const,
    name: 'Free',
    price: 0,
    description: 'Para testar o sistema',
    features: ['1 agente de IA', '1 número de WhatsApp', '100 conversas/mês', '500 respostas de IA/mês', 'Horário de atendimento'],
    limits: { maxAgents: 1, maxWhatsapp: 1, maxConversations: 100, maxAiRequests: 500, maxTeamMembers: 1 },
  },
  {
    planId: 'STARTER' as const,
    name: 'Starter',
    price: 147,
    description: 'Ideal para pequenos negócios',
    features: ['3 agentes de IA', '2 números de WhatsApp', '1.000 conversas/mês', '5.000 respostas de IA/mês', 'Filas', 'Respostas rápidas', 'Etiquetas', 'Equipe (até 5 pessoas)'],
    limits: { maxAgents: 3, maxWhatsapp: 2, maxConversations: 1000, maxAiRequests: 5000, maxTeamMembers: 5 },
  },
  {
    planId: 'PRO' as const,
    name: 'Pro',
    price: 381,
    description: 'Para equipes em crescimento',
    features: ['10 agentes de IA', '5 números de WhatsApp', '10.000 conversas/mês', '50.000 respostas de IA/mês', 'Campanhas', 'Base de conhecimento', 'Perfis de voz', 'Integrações (webhooks)', 'Chat interno', 'Relatórios'],
    limits: { maxAgents: 10, maxWhatsapp: 5, maxConversations: 10000, maxAiRequests: 50000, maxTeamMembers: 20 },
  },
  {
    planId: 'ENTERPRISE' as const,
    name: 'Enterprise',
    price: 1044,
    description: 'Solução completa e ilimitada',
    features: ['Agentes ilimitados', 'WhatsApp ilimitado', 'Conversas ilimitadas', 'IA ilimitada', 'Todos os módulos', 'Suporte prioritário'],
    limits: { maxAgents: -1, maxWhatsapp: -1, maxConversations: -1, maxAiRequests: -1, maxTeamMembers: -1 },
  },
];

/** Cria os planos padrão SOMENTE se a tabela PlanConfig estiver vazia. */
export async function ensureDefaultPlans(prisma: PrismaClient): Promise<number> {
  const count = await prisma.planConfig.count();
  if (count > 0) return 0;
  for (const plan of DEFAULT_PLANS) {
    await prisma.planConfig.upsert({
      where: { planId: plan.planId },
      update: {},
      create: { ...plan, isActive: true },
    });
  }
  return DEFAULT_PLANS.length;
}

/** Cupom de boas-vindas BEMVINDO (15% no PRO) — criado se não existir. */
export async function ensureWelcomeCoupon(prisma: PrismaClient): Promise<boolean> {
  const existing = await prisma.coupon.findUnique({ where: { code: 'BEMVINDO' } });
  if (existing) return false;
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  await prisma.coupon.create({
    data: { code: 'BEMVINDO', discount: 15, maxUses: 50, usedCount: 0, plan: 'PRO', isActive: true, expiresAt },
  });
  return true;
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'empresa';
}

async function uniqueSlug(prisma: PrismaClient, name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  for (let i = 2; i < 100; i++) {
    const taken = await prisma.tenant.findUnique({ where: { slug: candidate } });
    if (!taken) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export interface SuperAdminInput {
  email: string;
  password: string;
  name?: string;
  companyName?: string;
}

export interface SuperAdminResult {
  created: boolean;
  userId: string;
  tenantId: string;
  email: string;
}

const UNLIMITED = { maxAgents: -1, maxConversations: -1, maxWhatsapp: -1, maxAiRequests: -1 };

/**
 * Cria (se não existir) o SUPER_ADMIN e o tenant da empresa dele (plano ENTERPRISE, ativo).
 * Se o usuário já existir: garante papel SUPER_ADMIN e tenant ENTERPRISE ativo,
 * mas NUNCA sobrescreve a senha (para isso use resetAdminPassword).
 */
export async function createOrUpdateSuperAdmin(prisma: PrismaClient, input: SuperAdminInput): Promise<SuperAdminResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || 'Administrador';
  const companyName = input.companyName?.trim() || 'Minha Empresa';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'SUPER_ADMIN', isActive: true },
    });
    await prisma.tenant.update({
      where: { id: existing.tenantId },
      data: { plan: 'ENTERPRISE', isActive: true, ...UNLIMITED },
    });
    return { created: false, userId: existing.id, tenantId: existing.tenantId, email };
  }

  const password = passwordSchema.parse(input.password);
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const slug = await uniqueSlug(prisma, companyName);

  const tenant = await prisma.tenant.create({
    data: {
      name: companyName,
      slug,
      plan: 'ENTERPRISE',
      isActive: true,
      ...UNLIMITED,
      users: {
        create: {
          email,
          name,
          passwordHash,
          role: 'SUPER_ADMIN',
          isActive: true,
          emailVerified: true,
        },
      },
    },
    include: { users: true },
  });

  return { created: true, userId: tenant.users[0]!.id, tenantId: tenant.id, email };
}

/** Troca a senha do usuário com o e-mail informado e encerra as sessões abertas. */
export async function resetAdminPassword(prisma: PrismaClient, emailInput: string, newPassword: string): Promise<boolean> {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return false;
  const password = passwordSchema.parse(newPassword);
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, isActive: true } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  return true;
}
