import { ValidationError, NotFoundError, ForbiddenError } from '../lib/errors.js';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import prisma from '../lib/prisma.js';
import { ensureUniqueSerial } from './license.service.js';

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_SANDBOX_TOKEN = process.env.MP_SANDBOX_TOKEN || '';
const USE_SANDBOX = process.env.MP_SANDBOX === 'true';

const PLAN_CONFIG: Record<string, { name: string; price: number; months: number }> = {
  mensal: { name: 'AtendIA Mensal', price: 147, months: 1 },
  trimestral: { name: 'AtendIA Trimestral', price: 381, months: 3 },
  semestral: { name: 'AtendIA Semestral', price: 642, months: 6 },
  anual: { name: 'AtendIA Anual', price: 1044, months: 12 },
};

const BACKEND_URL = process.env.API_URL || 'http://localhost:3000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

function getClient(): MercadoPagoConfig {
  const token = USE_SANDBOX ? MP_SANDBOX_TOKEN : MP_ACCESS_TOKEN;
  if (!token) {
    throw new ValidationError('Mercado Pago access token not configured');
  }
  return new MercadoPagoConfig({ accessToken: token });
}

// ---------- Create Payment Preference ----------

export async function createPreference(data: {
  customerId?: string;
  name: string;
  email: string;
  cpfCnpj: string;
  phone: string;
  plan: string;
}) {
  const config = PLAN_CONFIG[data.plan];
  if (!config) {
    throw new ValidationError(`Plano inválido: ${data.plan}`);
  }

  let customer = await prisma.customer.findFirst({ where: { email: data.email } });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: data.name,
        email: data.email,
        cpfCnpj: data.cpfCnpj,
        phone: data.phone,
      },
    });
  } else {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: { name: data.name, cpfCnpj: data.cpfCnpj, phone: data.phone },
    });
  }

  const serial = await ensureUniqueSerial();

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + config.months);

  const license = await prisma.license.create({
    data: {
      customerId: customer.id,
      serial,
      plan: mapPlanToLicensePlan(data.plan) as any,
      expiresAt,
      status: 'INACTIVE',
    },
  });

  const payment = await prisma.payment.create({
    data: {
      customerId: customer.id,
      licenseId: license.id,
      licenseSerial: serial,
      gateway: 'MERCADOPAGO',
      amount: config.price,
      plan: data.plan,
      periodMonths: config.months,
      status: 'PENDING',
    },
  });

  const preference = new Preference(getClient());

  const result = await preference.create({
    body: {
      items: [
        {
          id: serial,
          title: config.name,
          description: `Licença AtendIA - Plano ${config.name}`,
          quantity: 1,
          unit_price: config.price,
          currency_id: 'BRL',
        },
      ],
      payer: {
        name: data.name,
        email: data.email,
        identification: {
          type: data.cpfCnpj.length <= 14 ? 'CPF' : 'CNPJ',
          number: data.cpfCnpj.replace(/\D/g, ''),
        },
      },
      back_urls: {
        success: `${FRONTEND_URL}/license/activate?serial=${serial}`,
        failure: `${FRONTEND_URL}/checkout?status=failure`,
        pending: `${FRONTEND_URL}/checkout?status=pending`,
      },
      auto_return: 'approved',
      external_reference: payment.id,
      notification_url: `${BACKEND_URL}/payments/webhook/mercadopago`,
      metadata: {
        payment_id: payment.id,
        license_id: license.id,
        serial,
        plan: data.plan,
      },
    },
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: { mercadopagoPreferenceId: result.id },
  });

  return {
    preferenceId: result.id,
    initPoint: result.init_point,
    sandboxInitPoint: result.sandbox_init_point,
    serial,
    paymentId: payment.id,
  };
}

// ---------- Handle Webhook ----------

export async function handleMercadoPagoWebhook(body: any) {
  const { type, action, data } = body;

  if (type === 'payment' && data?.id) {
    const mpPaymentId = data.id.toString();

    if (action === 'payment.approved') {
      await approvePaymentByMpId(mpPaymentId, body);
    } else if (action === 'payment.rejected' || action === 'payment.cancelled') {
      await rejectPaymentByMpId(mpPaymentId, body);
    } else if (action === 'payment.refunded' || action === 'chargebacks') {
      await refundPaymentByMpId(mpPaymentId, body);
    }

    return { processed: true };
  }

  if (type === 'merchant_order') {
    return { processed: true, type: 'merchant_order' };
  }

  return { processed: false, type };
}

// Multi-strategy payment lookup to resolve the gatewayTransactionId gap
async function findPaymentByMpId(mpPaymentId: string, body: any) {
  // Strategy 1: By gatewayTransactionId (if previously saved from a prior webhook)
  let payment = await prisma.payment.findFirst({
    where: { gateway: 'MERCADOPAGO', gatewayTransactionId: mpPaymentId },
    include: { license: true },
  });
  if (payment) return payment;

  // Strategy 2: By external_reference (our payment.id, set when preference was created)
  const externalRef = body?.external_reference;
  if (externalRef) {
    payment = await prisma.payment.findUnique({
      where: { id: externalRef },
      include: { license: true },
    });
    if (payment && payment.gateway === 'MERCADOPAGO') return payment;
  }

  // Strategy 3: By MP preference ID
  const preferenceId = body?.data?.preference_id || body?.preference_id;
  if (preferenceId) {
    payment = await prisma.payment.findFirst({
      where: { gateway: 'MERCADOPAGO', mercadopagoPreferenceId: preferenceId },
      include: { license: true },
    });
    if (payment) return payment;
  }

  return null;
}

async function approvePaymentByMpId(mpPaymentId: string, body: any) {
  const payment = await findPaymentByMpId(mpPaymentId, body);
  if (!payment || !payment.license) {
    console.warn(`MP webhook: payment not found for mpPaymentId=${mpPaymentId}`);
    return;
  }

  if (payment.status === 'APPROVED') return;

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'APPROVED',
        paidAt: new Date(),
        mercadopagoStatus: 'approved',
        gatewayTransactionId: mpPaymentId,
      },
    }),
    prisma.license.update({
      where: { id: payment.licenseId! },
      data: { status: 'ACTIVE' },
    }),
  ]);
}

async function rejectPaymentByMpId(mpPaymentId: string, body: any) {
  const payment = await findPaymentByMpId(mpPaymentId, body);
  if (!payment) return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'REJECTED',
      mercadopagoStatus: 'rejected',
      gatewayTransactionId: mpPaymentId,
    },
  });
}

async function refundPaymentByMpId(mpPaymentId: string, body: any) {
  const payment = await findPaymentByMpId(mpPaymentId, body);
  if (!payment) return;

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED', mercadopagoStatus: 'refunded', gatewayTransactionId: mpPaymentId },
    }),
    prisma.license.updateMany({
      where: { customerId: payment.customerId, status: 'ACTIVE' },
      data: { status: 'SUSPENDED' },
    }),
  ]);
}

// ---------- Check Payment Status ----------

export async function getPaymentStatus(paymentId: string, tenantId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      customer: { select: { tenantId: true } },
    },
  });

  if (!payment) {
    throw new NotFoundError('Pagamento', paymentId);
  }

  if (payment.customer.tenantId && payment.customer.tenantId !== tenantId) {
    throw new ForbiddenError('Acesso negado');
  }

  return {
    id: payment.id,
    status: payment.status,
    plan: payment.plan,
    amount: payment.amount,
    serial: payment.licenseSerial,
    licenseStatus: payment.licenseId,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt,
  };
}

function mapPlanToLicensePlan(plan: string): string {
  if (plan === 'anual' || plan === 'semestral') return 'PRO';
  return 'STARTER';
}
