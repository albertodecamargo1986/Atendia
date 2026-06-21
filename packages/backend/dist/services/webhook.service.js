"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebhook = createWebhook;
exports.listWebhooks = listWebhooks;
exports.updateWebhook = updateWebhook;
exports.deleteWebhook = deleteWebhook;
exports.testWebhook = testWebhook;
exports.triggerEvent = triggerEvent;
exports.getDeliveries = getDeliveries;
const errors_js_1 = require("../lib/errors.js");
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const crypto_1 = __importDefault(require("crypto"));
const promises_1 = __importDefault(require("dns/promises"));
const BLOCKED_HOSTS = /^(localhost$|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd|fe[89ab])/i;
async function isUrlSafe(urlStr) {
    let parsed;
    try {
        parsed = new URL(urlStr);
    }
    catch {
        return false;
    }
    if (!['http:', 'https:'].includes(parsed.protocol))
        return false;
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.test(hostname))
        return false;
    try {
        const addresses = await promises_1.default.resolve4(hostname);
        for (const addr of addresses) {
            if (BLOCKED_HOSTS.test(addr))
                return false;
        }
    }
    catch {
        if (hostname !== 'localhost')
            return true;
        return false;
    }
    return true;
}
async function createWebhook(tenantId, url, events, secret) {
    if (!(await isUrlSafe(url))) {
        throw new errors_js_1.ValidationError('URL de webhook não permitida. Não aponte para IPs privados, localhost ou redes internas.');
    }
    const webhookSecret = secret || crypto_1.default.randomBytes(32).toString('hex');
    return prisma_js_1.default.webhook.create({
        data: { tenantId, url, events, secret: webhookSecret, isActive: true },
    });
}
async function listWebhooks(tenantId) {
    return prisma_js_1.default.webhook.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { deliveries: true } } },
    });
}
async function updateWebhook(webhookId, tenantId, data) {
    const webhook = await prisma_js_1.default.webhook.findFirst({ where: { id: webhookId, tenantId } });
    if (!webhook)
        throw new errors_js_1.NotFoundError('Webhook', webhookId);
    if (data.url && !(await isUrlSafe(data.url))) {
        throw new errors_js_1.ValidationError('URL de webhook não permitida. Não aponte para IPs privados, localhost ou redes internas.');
    }
    return prisma_js_1.default.webhook.update({
        where: { id: webhookId },
        data,
    });
}
async function deleteWebhook(webhookId, tenantId) {
    const webhook = await prisma_js_1.default.webhook.findFirst({ where: { id: webhookId, tenantId } });
    if (!webhook)
        throw new errors_js_1.NotFoundError('Webhook', webhookId);
    return prisma_js_1.default.webhook.delete({ where: { id: webhookId } });
}
async function testWebhook(webhookId, tenantId) {
    const webhook = await prisma_js_1.default.webhook.findFirst({ where: { id: webhookId, tenantId } });
    if (!webhook)
        throw new errors_js_1.NotFoundError('Webhook', webhookId);
    const payload = { event: 'test', timestamp: new Date().toISOString(), data: { message: 'Teste de webhook do AtendIA' } };
    const result = await deliverWebhook(webhook.id, webhook.url, webhook.secret, 'test', payload);
    return result;
}
async function triggerEvent(tenantId, event, data) {
    const webhooks = await prisma_js_1.default.webhook.findMany({
        where: { tenantId, isActive: true, events: { has: event } },
    });
    const results = await Promise.allSettled(webhooks.map(w => deliverWebhook(w.id, w.url, w.secret, event, data)));
    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    return { total: webhooks.length, succeeded, failed: webhooks.length - succeeded };
}
async function deliverWebhook(webhookId, url, secret, event, payload) {
    // Re-validate URL before delivery (in case DNS changed)
    if (!(await isUrlSafe(url))) {
        await prisma_js_1.default.webhookDelivery.create({
            data: { webhookId, event, payload: payload, response: 'Blocked: URL resolves to private IP', success: false, attempts: 1 },
        });
        return { success: false, statusCode: null, response: 'Blocked: URL resolves to private IP' };
    }
    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const signature = crypto_1.default.createHmac('sha256', secret).update(body).digest('hex');
    let statusCode = null;
    let responseText = '';
    let success = false;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-AtendIA-Signature': `sha256=${signature}`,
                'X-AtendIA-Event': event,
            },
            body,
            signal: AbortSignal.timeout(10000),
        });
        statusCode = res.status;
        responseText = await res.text().catch(() => '');
        success = res.status >= 200 && res.status < 300;
    }
    catch (err) {
        responseText = err.message;
        success = false;
    }
    await prisma_js_1.default.webhookDelivery.create({
        data: {
            webhookId,
            event,
            payload: payload,
            statusCode: statusCode || undefined,
            response: responseText.slice(0, 1000),
            success,
            attempts: 1,
        },
    });
    return { success, statusCode, response: responseText };
}
async function getDeliveries(webhookId, tenantId, limit = 50) {
    const webhook = await prisma_js_1.default.webhook.findFirst({ where: { id: webhookId, tenantId } });
    if (!webhook)
        throw new errors_js_1.NotFoundError('Webhook', webhookId);
    return prisma_js_1.default.webhookDelivery.findMany({
        where: { webhookId },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });
}
//# sourceMappingURL=webhook.service.js.map