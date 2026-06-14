import { NextRequest, NextResponse } from "next/server";
import { query, initDatabase } from "@/lib/db";

export async function GET() {
  try {
    await initDatabase();
    const result = await query("SELECT key, value FROM settings");

    const settings: Record<string, string> = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    const defaults: Record<string, string> = {
      plan_monthly: "147", plan_quarterly: "381", plan_semiannual: "642", plan_annual: "1044",
      email_serial_subject: "Sua Licenca AtendIA - Serial de Ativacao",
      stripe_api_key: "", stripe_webhook_secret: "",
      mercadopago_api_key: "", mercadopago_webhook_url: "",
      smtp_host: "", smtp_port: "587", smtp_user: "", smtp_pass: "",
      resend_api_key: "", email_provider: "resend",
      transfer_limit: "2", offline_tolerance_days: "7", heartbeat_interval_hours: "4",
    };

    return NextResponse.json({ success: true, data: { ...defaults, ...settings } });
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json({ error: "Erro ao carregar configuracoes" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json();

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string" || typeof value === "number") {
        await query(
          `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [key, String(value)]
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Settings PUT error:", error);
    return NextResponse.json({ error: "Erro ao salvar configuracoes" }, { status: 500 });
  }
}
