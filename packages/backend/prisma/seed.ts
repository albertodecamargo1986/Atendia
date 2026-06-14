import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...\n');

  const passwordHash = await bcrypt.hash('admin321', 12);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Empresa Demo',
      slug: 'demo',
      plan: 'FREE',
      maxAgents: 1,
      maxConversations: 100,
      maxWhatsapp: 1,
      maxAiRequests: 500,
      isActive: true,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'albertodecamargo@gmail.com' },
    update: { passwordHash, name: 'Alberto de Camargo' },
    create: {
      tenantId: tenant.id,
      email: 'albertodecamargo@gmail.com',
      name: 'Alberto de Camargo',
      passwordHash,
      role: 'OWNER',
      isActive: true,
      emailVerified: true,
    },
  });

  console.log('Tenant criado:', tenant.slug);
  console.log('User criado:', user.email);
  console.log('\nCredenciais de acesso:');
  console.log('  Email: albertodecamargo@gmail.com');
  console.log('  Senha: admin321');
  console.log('\nSeed completed!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
