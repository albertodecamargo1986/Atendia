import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const checkoutSchema = z.object({
  nome: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  email: z.string().email("Email invalido"),
  cpfCnpj: z.string().min(11, "CPF/CNPJ invalido").max(18),
  telefone: z.string().min(10, "Telefone invalido"),
  plan: z.enum(["mensal", "trimestral", "semestral", "anual"]),
});

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { nome, email, cpfCnpj, telefone, plan } = parsed.data;

    // Forward to backend payments API
    const res = await fetch(`${BACKEND_URL}/payments/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nome,
        email,
        cpfCnpj,
        phone: telefone,
        plan,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Erro ao processar o pedido." },
        { status: res.status }
      );
    }

    return NextResponse.json({
      success: true,
      serial: data.data.serial,
      preferenceId: data.data.preferenceId,
      initPoint: data.data.initPoint,
      sandboxInitPoint: data.data.sandboxInitPoint,
      paymentId: data.data.paymentId,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor. Tente novamente." },
      { status: 500 }
    );
  }
}
