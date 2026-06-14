const { PrismaClient } = require('/root/atend-ia/node_modules/.prisma/client');
const bcrypt = require('/root/atend-ia/node_modules/bcryptjs');
const prisma = new PrismaClient();

async function fix() {
  const hash = bcrypt.hashSync('At3nd1A@2024', 12);
  const user = await prisma.user.update({
    where: { email: 'albertodecamargo@gmail.com' },
    data: { passwordHash: hash }
  });
  console.log('Updated hash:', user.passwordHash);
  console.log('Verify:', bcrypt.compareSync('At3nd1A@2024', user.passwordHash));
  await prisma.$disconnect();
}
fix();
