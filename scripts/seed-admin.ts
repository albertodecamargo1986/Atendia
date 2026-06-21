// Script para criar cupom de teste e seed inicial na VPS
// Uso: npx tsx scripts/seed-admin.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Seed Admin ===');

  // 1. Criar cupom de teste (se não existir)
  const existing = await prisma.coupon.findUnique({ where: { code: 'BEMVINDO' } });
  if (!existing) {
    await prisma.coupon.create({
      data: {
        code: 'BEMVINDO',
        discount: 15,
        maxUses: 50,
        usedCount: 0,
        plan: 'PRO',
        isActive: true,
        expiresAt: new Date('2026-12-31T23:59:59Z'),
      },
    });
    console.log('✓ Cupom BEMVINDO (15% off PRO) criado');
  } else {
    console.log('→ Cupom BEMVINDO já existe');
  }

  // 2. Listar tenants ativos
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, plan: true } });
  console.log(`\nTenants (${tenants.length}):`);
  tenants.forEach(t => console.log(`  ${t.id.slice(0, 8)}... ${t.name.padEnd(20)} ${t.plan}`));

  console.log('\n=== Seed concluído ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
