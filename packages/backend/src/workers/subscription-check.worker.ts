import { Worker, Queue } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';

export function startSubscriptionCheckWorker() {
  const queue = new Queue('subscription-check', { connection: redis as any });

  // Schedule check every hour
  queue.add('check', {}, {
    repeat: { every: 3600000 },
  });

  const worker = new Worker(
    'subscription-check',
    async () => {
      const now = new Date();

      // Buscar subscriptions ACTIVE com currentPeriodEnd vencido
      const expired = await prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          currentPeriodEnd: { lte: now },
        },
        include: {
          tenant: { select: { id: true, name: true, isActive: true } },
        },
      });

      for (const sub of expired) {
        if (!sub.tenant.isActive) continue; // já está inativo

        // Marcar subscription como PAST_DUE
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'PAST_DUE' },
        });

        // Desativar tenant
        await prisma.tenant.update({
          where: { id: sub.tenant.id },
          data: { isActive: false },
        });

        // Audit log
        await prisma.auditLog.create({
          data: {
            tenantId: sub.tenant.id,
            action: 'SUBSCRIPTION_EXPIRED',
            entity: 'Tenant',
            entityId: sub.tenant.id,
            details: { reason: 'currentPeriodEnd expirado', currentPeriodEnd: sub.currentPeriodEnd },
          },
        });

        console.log(`Tenant ${sub.tenant.name} (${sub.tenant.id}) desativado por subscription expirada`);
      }

      if (expired.length > 0) {
        console.log(`Subscription check: ${expired.length} tenant(s) desativado(s) por inadimplência`);
      }
    },
    { connection: redis as any }
  );

  worker.on('error', (err) => {
    console.error('Subscription check worker error:', err.message);
  });

  return worker;
}
