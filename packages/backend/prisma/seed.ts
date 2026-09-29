/**
 * Seed do AtendIA — sem dados pessoais.
 *  - Cria os planos padrão (PlanConfig) se a tabela estiver vazia
 *  - Cria o cupom BEMVINDO se não existir
 *  - Se ADMIN_EMAIL e ADMIN_PASSWORD estiverem no ambiente, cria o SUPER_ADMIN
 *    (mesma lógica do script create-admin). Nunca sobrescreve senha existente.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createOrUpdateSuperAdmin, ensureDefaultPlans, ensureWelcomeCoupon } from '../src/scripts/bootstrap-data.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Populando dados iniciais...');

  const plans = await ensureDefaultPlans(prisma);
  console.log(plans > 0 ? `Planos padrão criados (${plans}).` : 'Planos já existiam — mantidos.');

  const coupon = await ensureWelcomeCoupon(prisma);
  console.log(coupon ? 'Cupom BEMVINDO criado.' : 'Cupom BEMVINDO já existia.');

  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const result = await createOrUpdateSuperAdmin(prisma, {
      email,
      password,
      name: process.env.ADMIN_NAME,
      companyName: process.env.COMPANY_NAME,
    });
    console.log(result.created
      ? `Administrador criado: ${result.email}`
      : `Administrador ${result.email} já existia (senha mantida).`);
  } else {
    console.log('ADMIN_EMAIL/ADMIN_PASSWORD não definidos — nenhum administrador criado.');
  }

  console.log('Seed concluído.');
}

main()
  .catch((e) => {
    console.error('Falha no seed:', e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
