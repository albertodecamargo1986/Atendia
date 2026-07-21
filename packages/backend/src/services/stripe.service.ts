import prisma from '../lib/prisma.js';
import { sendWelcomeEmail } from '../lib/email.js';

export async function handleStripeWebhook(body: any) {
  const { type, data } = body;

  switch (type) {
    case 'checkout.session.completed': {
      const session = data?.object;
      const paymentId = session?.metadata?.payment_id;
      if (paymentId) {
        await approvePayment(paymentId, session.id);
      }
      break;
    }

    case 'checkout.session.expired': {
      const session = data?.object;
      const paymentId = session?.metadata?.payment_id;
      if (paymentId) {
        await expirePayment(paymentId);
      }
      break;
    }

    case 'payment_intent.succeeded': {
      const paymentIntent = data?.object;
      const paymentId = paymentIntent?.metadata?.payment_id;
      if (paymentId) {
        await approvePayment(paymentId, paymentIntent.id);
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = data?.object;
      const paymentId = paymentIntent?.metadata?.payment_id;
      if (paymentId) {
        await rejectPayment(paymentId);
      }
      break;
    }

    default:
      console.log(`Unhandled Stripe event type: ${type}`);
  }

  return { received: true };
}

async function approvePayment(paymentId: string, transactionId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    console.warn(`Stripe webhook: payment not found for id=${paymentId}`);
    return;
  }

  if (payment.status === 'APPROVED') return;

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'APPROVED',
      paidAt: new Date(),
      gateway: 'STRIPE',
      gatewayTransactionId: transactionId,
    },
  });

  // Create/update subscription for the customer's tenant
  if (payment.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: payment.customerId },
      select: { tenantId: true },
    });

    if (customer?.tenantId) {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + (payment.periodMonths || 1));

      await prisma.subscription.upsert({
        where: { tenantId: customer.tenantId },
        create: {
          tenantId: customer.tenantId,
          status: 'ACTIVE',
          currentPeriodEnd: periodEnd,
        },
        update: {
          status: 'ACTIVE',
          currentPeriodEnd: periodEnd,
        },
      });

      await prisma.tenant.updateMany({
        where: { id: customer.tenantId, isActive: false },
        data: { isActive: true },
      });

      // Enviar email de boas-vindas
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: customer.tenantId },
          select: { name: true },
        });
        const customerData = await prisma.customer.findUnique({
          where: { id: payment.customerId },
          select: { email: true, name: true },
        });
        if (tenant && customerData) {
          await sendWelcomeEmail(customerData.email, customerData.name, tenant.name);
        }
      } catch (emailErr) {
        console.error('Failed to send welcome email:', emailErr);
      }
    }
  }
}

async function expirePayment(paymentId: string) {
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'CANCELLED' },
  }).catch(() => {
    console.warn(`Stripe webhook: payment not found for expire id=${paymentId}`);
  });
}

async function rejectPayment(paymentId: string) {
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'REJECTED' },
  }).catch(() => {
    console.warn(`Stripe webhook: payment not found for reject id=${paymentId}`);
  });
}