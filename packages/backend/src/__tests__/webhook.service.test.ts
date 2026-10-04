import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockDns } = vi.hoisted(() => ({
  mockPrisma: {
    webhook: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    webhookDelivery: { create: vi.fn(), findMany: vi.fn() },
  },
  mockDns: { resolve4: vi.fn() },
}));

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('dns/promises', () => ({ default: mockDns, resolve4: mockDns.resolve4 }));

import { createWebhook, triggerEvent } from '../services/webhook.service.js';
import crypto from 'crypto';
import { ValidationError } from '../lib/errors.js';

const tenantId = 'tenant-1';

describe('webhook.service — SSRF protection (via createWebhook)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('blocks localhost', async () => {
    await expect(createWebhook(tenantId, 'http://localhost/webhook', ['ticket.create']))
      .rejects.toThrow(ValidationError);
  });

  it('blocks 127.x.x.x', async () => {
    await expect(createWebhook(tenantId, 'http://127.0.0.1/webhook', ['ticket.create']))
      .rejects.toThrow(ValidationError);
  });

  it('blocks 10.x.x.x (private class A)', async () => {
    await expect(createWebhook(tenantId, 'http://10.0.0.1/webhook', ['ticket.create']))
      .rejects.toThrow(ValidationError);
  });

  it('blocks 192.168.x.x (private class C)', async () => {
    await expect(createWebhook(tenantId, 'http://192.168.1.1/webhook', ['ticket.create']))
      .rejects.toThrow(ValidationError);
  });

  it('blocks 172.16-31.x.x (private class B)', async () => {
    await expect(createWebhook(tenantId, 'http://172.16.0.1/webhook', ['ticket.create']))
      .rejects.toThrow(ValidationError);
    await expect(createWebhook(tenantId, 'http://172.31.255.1/webhook', ['ticket.create']))
      .rejects.toThrow(ValidationError);
  });

  it('blocks non-http protocols', async () => {
    await expect(createWebhook(tenantId, 'ftp://example.com/webhook', ['ticket.create']))
      .rejects.toThrow(ValidationError);
  });

  it('blocks 169.254.x.x (link-local / AWS metadata)', async () => {
    await expect(createWebhook(tenantId, 'http://169.254.169.254/metadata', ['ticket.create']))
      .rejects.toThrow(ValidationError);
  });

  it('blocks 0.0.0.0', async () => {
    await expect(createWebhook(tenantId, 'http://0.0.0.0/webhook', ['ticket.create']))
      .rejects.toThrow(ValidationError);
  });

  it('blocks fe80:: link-local via DNS resolution', async () => {
    mockDns.resolve4.mockResolvedValue(['127.0.0.1']);
    await expect(createWebhook(tenantId, 'https://rebind-evil.com/hook', ['ticket.create']))
      .rejects.toThrow(ValidationError);
  });

  it('blocks DNS rebinding to private IP', async () => {
    mockDns.resolve4.mockResolvedValue(['10.0.0.1']);
    await expect(createWebhook(tenantId, 'https://evil.example.com/hook', ['ticket.create']))
      .rejects.toThrow(ValidationError);
  });

  it('allows public HTTPS URL', async () => {
    mockDns.resolve4.mockResolvedValue(['93.184.216.34']);
    mockPrisma.webhook.create.mockResolvedValue({
      id: 'wh-1', tenantId, url: 'https://example.com/hook',
      events: ['ticket.create'], secret: 'auto-generated', isActive: true,
    });

    const result = await createWebhook(tenantId, 'https://example.com/hook', ['ticket.create']);

    expect(mockPrisma.webhook.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId, url: 'https://example.com/hook', events: ['ticket.create'], isActive: true,
        }),
      }),
    );
  });
});

describe('webhook.service — createWebhook', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates webhook with auto-generated secret', async () => {
    mockDns.resolve4.mockResolvedValue(['93.184.216.34']);
    mockPrisma.webhook.create.mockResolvedValue({
      id: 'wh-1', tenantId, url: 'https://example.com/hook',
      events: ['ticket.create'], secret: 'auto-generated', isActive: true,
    });

    const result = await createWebhook(tenantId, 'https://example.com/hook', ['ticket.create']);

    expect(mockPrisma.webhook.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId, url: 'https://example.com/hook', events: ['ticket.create'], isActive: true,
        }),
      }),
    );
    // Secret should be a 64-char hex string (crypto.randomBytes(32).toString('hex'))
    const createCall = mockPrisma.webhook.create.mock.calls[0][0];
    expect(createCall.data.secret).toMatch(/^[a-f0-9]{64}$/);
  });

  it('creates webhook with custom secret', async () => {
    mockDns.resolve4.mockResolvedValue(['93.184.216.34']);
    mockPrisma.webhook.create.mockResolvedValue({ id: 'wh-2' });

    await createWebhook(tenantId, 'https://example.com/hook', ['ticket.update'], 'my-secret');

    expect(mockPrisma.webhook.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ secret: 'my-secret' }),
      }),
    );
  });
});

describe('webhook.service — webhooks de saída (triggerEvent)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDns.resolve4.mockResolvedValue(['93.184.216.34']);
    mockPrisma.webhook.findMany.mockResolvedValue([{ id: 'wh1', url: 'https://example.com/hook', secret: 's3cr3t' }]);
  });

  it('só webhooks ativos que assinam o evento; corpo assinado com HMAC do secret', async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, text: async () => 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await triggerEvent(tenantId, 'message.received', { conversationId: 'c1' });
    expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith({ where: { tenantId, isActive: true, events: { has: 'message.received' } } });
    const [, init] = fetchMock.mock.calls[0] as any[];
    const expected = crypto.createHmac('sha256', 's3cr3t').update(init.body).digest('hex');
    expect(init.headers['X-AtendIA-Signature']).toBe(`sha256=${expected}`);
    expect(init.headers['X-AtendIA-Event']).toBe('message.received');
    expect(res).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith({ data: expect.objectContaining({ success: true, attempts: 1 }) });
    vi.unstubAllGlobals();
  });

  it('erro 5xx: tenta de novo com espera (até 3x) e registra as tentativas', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({ status: 503, text: async () => 'down' }));
    vi.stubGlobal('fetch', fetchMock);
    const p = triggerEvent(tenantId, 'ticket.created', { ticketId: 't' });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.failed).toBe(1);
    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith({ data: expect.objectContaining({ success: false, attempts: 3, statusCode: 503 }) });
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('erro 4xx do receptor: não repete', async () => {
    const fetchMock = vi.fn(async () => ({ status: 400, text: async () => 'bad' }));
    vi.stubGlobal('fetch', fetchMock);
    await triggerEvent(tenantId, 'ticket.closed', {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
