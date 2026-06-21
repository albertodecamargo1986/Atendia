"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { mockPrisma, mockDns } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        webhook: { findFirst: vitest_1.vi.fn(), findMany: vitest_1.vi.fn(), create: vitest_1.vi.fn(), update: vitest_1.vi.fn(), delete: vitest_1.vi.fn() },
        webhookDelivery: { create: vitest_1.vi.fn(), findMany: vitest_1.vi.fn() },
    },
    mockDns: { resolve4: vitest_1.vi.fn() },
}));
vitest_1.vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vitest_1.vi.mock('dns/promises', () => ({ default: mockDns, resolve4: mockDns.resolve4 }));
const webhook_service_js_1 = require("../services/webhook.service.js");
const errors_js_1 = require("../lib/errors.js");
const tenantId = 'tenant-1';
(0, vitest_1.describe)('webhook.service — SSRF protection (via createWebhook)', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('blocks localhost', async () => {
        await (0, vitest_1.expect)((0, webhook_service_js_1.createWebhook)(tenantId, 'http://localhost/webhook', ['ticket.create']))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('blocks 127.x.x.x', async () => {
        await (0, vitest_1.expect)((0, webhook_service_js_1.createWebhook)(tenantId, 'http://127.0.0.1/webhook', ['ticket.create']))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('blocks 10.x.x.x (private class A)', async () => {
        await (0, vitest_1.expect)((0, webhook_service_js_1.createWebhook)(tenantId, 'http://10.0.0.1/webhook', ['ticket.create']))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('blocks 192.168.x.x (private class C)', async () => {
        await (0, vitest_1.expect)((0, webhook_service_js_1.createWebhook)(tenantId, 'http://192.168.1.1/webhook', ['ticket.create']))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('blocks 172.16-31.x.x (private class B)', async () => {
        await (0, vitest_1.expect)((0, webhook_service_js_1.createWebhook)(tenantId, 'http://172.16.0.1/webhook', ['ticket.create']))
            .rejects.toThrow(errors_js_1.ValidationError);
        await (0, vitest_1.expect)((0, webhook_service_js_1.createWebhook)(tenantId, 'http://172.31.255.1/webhook', ['ticket.create']))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('blocks non-http protocols', async () => {
        await (0, vitest_1.expect)((0, webhook_service_js_1.createWebhook)(tenantId, 'ftp://example.com/webhook', ['ticket.create']))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('blocks 169.254.x.x (link-local / AWS metadata)', async () => {
        await (0, vitest_1.expect)((0, webhook_service_js_1.createWebhook)(tenantId, 'http://169.254.169.254/metadata', ['ticket.create']))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('blocks 0.0.0.0', async () => {
        await (0, vitest_1.expect)((0, webhook_service_js_1.createWebhook)(tenantId, 'http://0.0.0.0/webhook', ['ticket.create']))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('blocks fe80:: link-local via DNS resolution', async () => {
        mockDns.resolve4.mockResolvedValue(['127.0.0.1']);
        await (0, vitest_1.expect)((0, webhook_service_js_1.createWebhook)(tenantId, 'https://rebind-evil.com/hook', ['ticket.create']))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('blocks DNS rebinding to private IP', async () => {
        mockDns.resolve4.mockResolvedValue(['10.0.0.1']);
        await (0, vitest_1.expect)((0, webhook_service_js_1.createWebhook)(tenantId, 'https://evil.example.com/hook', ['ticket.create']))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('allows public HTTPS URL', async () => {
        mockDns.resolve4.mockResolvedValue(['93.184.216.34']);
        mockPrisma.webhook.create.mockResolvedValue({
            id: 'wh-1', tenantId, url: 'https://example.com/hook',
            events: ['ticket.create'], secret: 'auto-generated', isActive: true,
        });
        const result = await (0, webhook_service_js_1.createWebhook)(tenantId, 'https://example.com/hook', ['ticket.create']);
        (0, vitest_1.expect)(mockPrisma.webhook.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({
                tenantId, url: 'https://example.com/hook', events: ['ticket.create'], isActive: true,
            }),
        }));
    });
});
(0, vitest_1.describe)('webhook.service — createWebhook', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('creates webhook with auto-generated secret', async () => {
        mockDns.resolve4.mockResolvedValue(['93.184.216.34']);
        mockPrisma.webhook.create.mockResolvedValue({
            id: 'wh-1', tenantId, url: 'https://example.com/hook',
            events: ['ticket.create'], secret: 'auto-generated', isActive: true,
        });
        const result = await (0, webhook_service_js_1.createWebhook)(tenantId, 'https://example.com/hook', ['ticket.create']);
        (0, vitest_1.expect)(mockPrisma.webhook.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({
                tenantId, url: 'https://example.com/hook', events: ['ticket.create'], isActive: true,
            }),
        }));
        // Secret should be a 64-char hex string (crypto.randomBytes(32).toString('hex'))
        const createCall = mockPrisma.webhook.create.mock.calls[0][0];
        (0, vitest_1.expect)(createCall.data.secret).toMatch(/^[a-f0-9]{64}$/);
    });
    (0, vitest_1.it)('creates webhook with custom secret', async () => {
        mockDns.resolve4.mockResolvedValue(['93.184.216.34']);
        mockPrisma.webhook.create.mockResolvedValue({ id: 'wh-2' });
        await (0, webhook_service_js_1.createWebhook)(tenantId, 'https://example.com/hook', ['ticket.update'], 'my-secret');
        (0, vitest_1.expect)(mockPrisma.webhook.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({ secret: 'my-secret' }),
        }));
    });
});
//# sourceMappingURL=webhook.service.test.js.map