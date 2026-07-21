"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSubscriptionCheckWorker = startSubscriptionCheckWorker;
const bullmq_1 = require("bullmq");
const redis_js_1 = __importDefault(require("../lib/redis.js"));
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
function startSubscriptionCheckWorker() {
    const queue = new bullmq_1.Queue('subscription-check', { connection: redis_js_1.default });
    // Schedule check every hour
    queue.add('check', {}, {
        repeat: { every: 3600000 },
    });
    const worker = new bullmq_1.Worker('subscription-check', async () => {
        const now = new Date();
        // Buscar subscriptions ACTIVE com currentPeriodEnd vencido
        const expired = await prisma_js_1.default.subscription.findMany({
            where: {
                status: 'ACTIVE',
                currentPeriodEnd: { lte: now },
            },
            include: {
                tenant: { select: { id: true, name: true, isActive: true } },
            },
        });
        for (const sub of expired) {
            if (!sub.tenant.isActive)
                continue; // já está inativo
            // Marcar subscription como PAST_DUE
            await prisma_js_1.default.subscription.update({
                where: { id: sub.id },
                data: { status: 'PAST_DUE' },
            });
            // Desativar tenant
            await prisma_js_1.default.tenant.update({
                where: { id: sub.tenant.id },
                data: { isActive: false },
            });
            // Audit log
            await prisma_js_1.default.auditLog.create({
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
    }, { connection: redis_js_1.default });
    worker.on('error', (err) => {
        console.error('Subscription check worker error:', err.message);
    });
    return worker;
}
//# sourceMappingURL=subscription-check.worker.js.map