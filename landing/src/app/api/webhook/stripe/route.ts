import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { query } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const sig = request.headers.get("stripe-signature");

    if (!sig) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured — rejecting webhook");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err: any) {
      console.error("Stripe webhook signature verification failed:", err.message);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const licenseSerial = session.metadata?.license_serial;
        if (licenseSerial) {
          await query(
            "UPDATE licenses SET status = $1 WHERE serial = $2",
            ["active", licenseSerial]
          ).catch((err: any) => {
            console.error("License activation failed in webhook:", err.message);
          });
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const licenseSerial = session.metadata?.license_serial;
        if (licenseSerial) {
          await query(
            "UPDATE licenses SET status = $1 WHERE serial = $2 AND status = $3",
            ["expired", licenseSerial, "pending"]
          ).catch((err: any) => {
            console.error("License expiration failed in webhook:", err.message);
          });
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const licenseSerial = paymentIntent.metadata?.license_serial;
        if (licenseSerial) {
          await query(
            `UPDATE payments SET status = 'paid', paid_at = NOW(), gateway_transaction_id = $1
             WHERE license_serial = $2`,
            [paymentIntent.id, licenseSerial]
          ).catch((err: any) => {
            console.error("Payment update failed in webhook:", err.message);
          });
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const licenseSerial = paymentIntent.metadata?.license_serial;
        if (licenseSerial) {
          await query(
            "UPDATE licenses SET status = $1 WHERE serial = $2",
            ["suspended", licenseSerial]
          ).catch((err: any) => {
            console.error("License suspension failed in webhook:", err.message);
          });
        }
        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Stripe webhook error:", error.message);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
