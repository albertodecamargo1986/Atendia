import type Stripe from 'stripe';
import { getStripeClient } from './mercadopago.service.js';
import { approvePayment, rejectPayment, cancelPayment } from './payment-approval.service.js';
import { ValidationError } from '../lib/errors.js';

/**
 * Valida a assinatura do webhook Stripe (header stripe-signature + STRIPE_WEBHOOK_SECRET)
 * usando o corpo BRUTO da requisição. Lança ValidationError se inválida.
 */
export function constructStripeEvent(rawBody: Buffer | undefined, signature: string | undefined): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new ValidationError('Webhook Stripe não configurado');
  if (!rawBody || !signature) throw new ValidationError('Assinatura do webhook ausente');
  try {
    return getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new ValidationError('Assinatura do webhook inválida');
  }
}

/** Processa um evento Stripe JÁ verificado. */
export async function handleStripeWebhook(event: Stripe.Event) {
  const object: any = event.data?.object;
  const paymentId: string | undefined = object?.metadata?.payment_id || object?.client_reference_id;

  switch (event.type) {
    case 'checkout.session.completed':
      if (paymentId && object?.payment_status === 'paid') await approvePayment(paymentId, object.id);
      break;
    case 'checkout.session.async_payment_succeeded':
      if (paymentId) await approvePayment(paymentId, object.id);
      break;
    case 'checkout.session.expired':
      if (paymentId) await cancelPayment(paymentId);
      break;
    case 'checkout.session.async_payment_failed':
    case 'payment_intent.payment_failed':
      if (paymentId) await rejectPayment(paymentId, object.id);
      break;
    case 'payment_intent.succeeded':
      if (paymentId) await approvePayment(paymentId, object.id);
      break;
    default:
      console.log(`Evento Stripe não tratado: ${event.type}`);
  }

  return { received: true };
}
