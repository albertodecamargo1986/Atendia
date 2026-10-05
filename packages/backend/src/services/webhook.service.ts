import { NotFoundError, ValidationError } from '../lib/errors.js';
import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import { z } from 'zod';
import dns from 'dns/promises';

const BLOCKED_HOSTS = /^(localhost$|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd|fe[89ab])/i;

async function isUrlSafe(urlStr: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return false;

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.test(hostname)) return false;

  try {
    const addresses = await dns.resolve4(hostname);
    for (const addr of addresses) {
      if (BLOCKED_HOSTS.test(addr)) return false;
    }
  } catch {
    if (hostname !== 'localhost') return true;
    return false;
  }

  return true;
}

export async function createWebhook(tenantId: string, url: string, events: string[], secret?: string) {
  if (!(await isUrlSafe(url))) {
    throw new ValidationError('URL de webhook não permitida. Não aponte para IPs privados, localhost ou redes internas.');
  }
  const webhookSecret = secret || crypto.randomBytes(32).toString('hex');
  return prisma.webhook.create({
    data: { tenantId, url, events, secret: webhookSecret, isActive: true },
  });
}

export async function listWebhooks(tenantId: string) {
  return prisma.webhook.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { deliveries: true } } },
  });
}

const updateWebhookSchema = z.object({
  url: z.string().url('URL inválida').optional(),
  events: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export async function updateWebhook(webhookId: string, tenantId: string, input: unknown) {
  const data = updateWebhookSchema.parse(input);
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, tenantId } });
  if (!webhook) throw new NotFoundError('Webhook', webhookId);

  if (data.url && !(await isUrlSafe(data.url))) {
    throw new ValidationError('URL de webhook não permitida. Não aponte para IPs privados, localhost ou redes internas.');
  }

  return prisma.webhook.update({
    where: { id: webhookId },
    data,
  });
}

export async function deleteWebhook(webhookId: string, tenantId: string) {
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, tenantId } });
  if (!webhook) throw new NotFoundError('Webhook', webhookId);
  return prisma.webhook.delete({ where: { id: webhookId } });
}

export async function testWebhook(webhookId: string, tenantId: string) {
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, tenantId } });
  if (!webhook) throw new NotFoundError('Webhook', webhookId);

  const payload = { event: 'test', timestamp: new Date().toISOString(), data: { message: 'Teste de webhook do AtendIA' } };
  const result = await deliverWebhook(webhook.id, webhook.url, webhook.secret, 'test', payload);
  return result;
}

/** Eventos que o AtendIA dispara para webhooks de saída. */
export const WEBHOOK_EVENTS = [
  'message.received',
  'message.sent',
  'ticket.created',
  'ticket.closed',
  'whatsapp.connected',
  'whatsapp.disconnected',
  'whatsapp.restricted',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Tentativas por entrega (com espera crescente entre elas). */
const DELIVERY_RETRY_DELAYS_MS = [0, 2000, 10000];

export async function triggerEvent(tenantId: string, event: string, data: Record<string, unknown>) {
  const webhooks = await prisma.webhook.findMany({
    where: { tenantId, isActive: true, events: { has: event } },
  });

  const results = await Promise.allSettled(
    webhooks.map(w => deliverWebhook(w.id, w.url, w.secret, event, data, DELIVERY_RETRY_DELAYS_MS))
  );

  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  return { total: webhooks.length, succeeded, failed: webhooks.length - succeeded };
}

/**
 * Dispara um evento sem bloquear quem chamou (fire-and-forget com retry e registro em
 * WebhookDelivery). Erros nunca sobem: webhook externo fora do ar não pode travar o atendimento.
 */
export function emitWebhookEvent(tenantId: string, event: WebhookEvent, data: Record<string, unknown>): void {
  setImmediate(() => {
    triggerEvent(tenantId, event, data).catch((err: any) => {
      console.error(`[webhook] falha ao disparar ${event}:`, err?.message);
    });
  });
}

async function deliverWebhook(
  webhookId: string,
  url: string,
  secret: string,
  event: string,
  payload: Record<string, unknown>,
  retryDelaysMs: number[] = [0],
) {
  // Re-validate URL before delivery (in case DNS changed)
  if (!(await isUrlSafe(url))) {
    await prisma.webhookDelivery.create({
      data: { webhookId, event, payload: payload as any, response: 'Blocked: URL resolves to private IP', success: false, attempts: 1 },
    });
    return { success: false, statusCode: null, response: 'Blocked: URL resolves to private IP' };
  }

  // Mesmo corpo/assinatura em todas as tentativas (o receptor pode deduplicar)
  const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  let statusCode: number | null = null;
  let responseText = '';
  let success = false;
  let attempts = 0;

  for (const delay of retryDelaysMs) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    attempts++;
    statusCode = null;
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
    } catch (err: any) {
      responseText = err.message;
      success = false;
    }
    // 2xx: pronto. 4xx (exceto 408/429): erro do receptor, repetir não adianta.
    if (success) break;
    if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429) break;
  }

  await prisma.webhookDelivery.create({
    data: {
      webhookId,
      event,
      payload: payload as any,
      statusCode: statusCode || undefined,
      response: responseText.slice(0, 1000),
      success,
      attempts,
    },
  });

  return { success, statusCode, response: responseText };
}

export async function getDeliveries(webhookId: string, tenantId: string, limit = 50) {
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, tenantId } });
  if (!webhook) throw new NotFoundError('Webhook', webhookId);
  return prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
