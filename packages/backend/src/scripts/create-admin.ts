/**
 * Cria o administrador da plataforma (SUPER_ADMIN) — usado pelo instalador.
 *
 * Uso (no container, WORKDIR /app/packages/backend):
 *   docker compose exec -T -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... backend node dist/scripts/create-admin.js
 *   ... node dist/scripts/create-admin.js --reset-password   (só troca a senha)
 *
 * Variáveis: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME (padrão "Administrador"),
 *            COMPANY_NAME (padrão "Minha Empresa").
 * Idempotente: se o usuário já existir, garante SUPER_ADMIN + plano ENTERPRISE
 * e NÃO altera a senha.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import {
  createOrUpdateSuperAdmin,
  ensureDefaultPlans,
  ensureWelcomeCoupon,
  resetAdminPassword,
} from './bootstrap-data.js';

function fail(message: string): never {
  console.error(`ERRO: ${message}`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const resetPassword = args.includes('--reset-password');

  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const name = process.env.ADMIN_NAME?.trim() || 'Administrador';
  const companyName = process.env.COMPANY_NAME?.trim() || 'Minha Empresa';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail('defina ADMIN_EMAIL com um e-mail válido.');
  }
  if (!password) {
    fail('defina ADMIN_PASSWORD (mínimo 8 caracteres, com letras e números).');
  }

  const prisma = new PrismaClient();
  try {
    if (resetPassword) {
      const ok = await resetAdminPassword(prisma, email, password);
      if (!ok) fail(`nenhum usuário encontrado com o e-mail ${email}.`);
      console.log(`Senha do usuário ${email} atualizada com sucesso. Sessões abertas foram encerradas.`);
      return;
    }

    const plans = await ensureDefaultPlans(prisma);
    if (plans > 0) console.log(`Planos padrão criados (${plans}).`);
    if (await ensureWelcomeCoupon(prisma)) console.log('Cupom BEMVINDO criado.');

    const result = await createOrUpdateSuperAdmin(prisma, { email, password, name, companyName });
    if (result.created) {
      console.log(`Administrador criado: ${result.email} (empresa "${companyName}", plano ENTERPRISE).`);
    } else {
      console.log(`Administrador ${result.email} já existia — permissões de SUPER_ADMIN garantidas (senha mantida).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    if (err instanceof ZodError) {
      fail(`senha inválida: ${err.issues.map((i) => i.message).join('; ')}`);
    }
    fail(err?.message || String(err));
  });
