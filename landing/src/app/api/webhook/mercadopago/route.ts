import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";

/**
 * Mercado Pago webhook handler — forwards to backend.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward webhook to backend
    await fetch(`${BACKEND_URL}/payments/webhook/mercadopago`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {
      console.log("Backend webhook forward failed");
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Mercado Pago webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ status: "ok" });
}
