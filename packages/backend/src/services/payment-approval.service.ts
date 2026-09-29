import prisma from '../lib/prisma.js';
import { sendWelcomeEmail } from '../lib/email.js';
import { updateTenantPlan } from './subscription.service.js';

const PLAN_VALUES = ['STARTER', 'PRO', 'ENTERPRISE'];

/**
 * Aprova um pagamento (chamado SOMENTE após webhook com assinatura verificada):
 *  - marca APPROVED (idempotente)
 *  - renova a assinatura do tenant e reativa o tenant
 *  - se Payment.plan for STARTER/PRO/ENTERPRISE, troca o plano do tenant
 */
export async function approvePayment(
  paymentId: string,
  gatewayTransactionId: string,
  extra: { mercadopagoStatus?: string } = {},
) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) {
    console.warn(`Pagamento não encontrado para aprovação: ${paymentId}`);
    return;
  }
  if (payment.status === 'APPROVED') return;

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'APPROVED',
      paidAt: new Date(),
      gatewayTransactionId,
      ...(extra.mercadopagoStatus ? { mercadopagoStatus: extra.mercadopagoStatus } : {}),
    },
  });

  const customer = await prisma.customer.findUnique({
    where: { id: payment.customerId },
    select: { tenantId: true, email: true, name: true },
  });
  if (!customer?.tenantId) return;
  const tenantId = customer.tenantId;

  const now = new Date();
  const existing = await prisma.subscription.findUnique({ where: { tenantId } });
  const base = existing?.currentPeriodEnd && existing.currentPeriodEnd > now ? new Date(existing.currentPeriodEnd) : now;
  const periodEnd = new Date(base);
  periodEnd.setMonth(periodEnd.getMonth() + (payment.periodMonths || 1));

  await prisma.subscription.upsert({
    where: { tenantId },
    create: { tenantId, status: 'ACTIVE', currentPeriodEnd: periodEnd },
    update: { status: 'ACTIVE', currentPeriodEnd: periodEnd },
  });

  await prisma.tenant.updateMany({
    where: { id: tenantId, isActive: false },
    data: { isActive: true },
  });

  if (PLAN_VALUES.includes(payment.plan)) {
    await updateTenantPlan(tenantId, payment.plan);
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      action: 'PAYMENT_APPROVED',
      entity: 'Payment',
      entityId: paymentId,
      details: { plan: payment.plan, amount: payment.amount, gateway: payment.gateway },
    },
  }).catch(() => {});

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    if (tenant) await sendWelcomeEmail(customer.email, customer.name, tenant.name);
  } catch (err) {
    console.error('Falha ao enviar e-mail de boas-vindas:', err);
  }
}

export async function rejectPayment(paymentId: string, gatewayTransactionId?: string, gatewayStatus?: string) {
  await prisma.payment.updateMany({
    where: { id: paymentId, status: { not: 'APPROVED' } },
    data: {
      status: 'REJECTED',
      ...(gatewayStatus ? { mercadopagoStatus: gatewayStatus } : {}),
      ...(gatewayTransactionId ? { gatewayTransactionId } : {}),
    },
  });
}

export async function refundPayment(paymentId: string, gatewayTransactionId?: string, gatewayStatus?: string) {
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: gatewayStatus === 'charged_back' ? 'CHARGED_BACK' : 'REFUNDED',
      ...(gatewayStatus ? { mercadopagoStatus: gatewayStatus } : {}),
      ...(gatewayTransactionId ? { gatewayTransactionId } : {}),
    },
  }).catch(() => {});
}

export async function cancelPayment(paymentId: string) {
  await prisma.payment.updateMany({
    where: { id: paymentId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
}
