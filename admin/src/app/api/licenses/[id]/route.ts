import { NextRequest, NextResponse } from "next/server";
import { query, initDatabase } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDatabase();
    const { id } = params;

    const licenseResult = await query(
      `SELECT l.*, c.name as customer_name, c.email as customer_email
       FROM licenses l JOIN customers c ON l.customer_id = c.id WHERE l.id = ?`,
      [id]
    );
    if (!licenseResult.rows[0]) {
      return NextResponse.json({ error: "Licenca nao encontrada" }, { status: 404 });
    }

    const eventsResult = await query(
      `SELECT id, event_type, ip_address, hwid, created_at FROM license_events WHERE license_id = ? ORDER BY created_at DESC LIMIT 50`,
      [id]
    );

    const alertsResult = await query(
      `SELECT id, alert_type, severity, description, ip_address, resolved, created_at FROM security_alerts WHERE license_id = ? ORDER BY created_at DESC LIMIT 50`,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: {
        ...licenseResult.rows[0],
        events: eventsResult.rows,
        alerts: alertsResult.rows,
      },
    });
  } catch (error) {
    console.error("License GET error:", error);
    return NextResponse.json({ error: "Erro ao carregar licenca" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDatabase();
    const { id } = params;
    const body = await request.json();
    const { action, extend_days, reason } = body;

    const existing = await query("SELECT * FROM licenses WHERE id = ?", [id]);
    if (!existing.rows[0]) {
      return NextResponse.json({ error: "Licenca nao encontrada" }, { status: 404 });
    }

    switch (action) {
      case "revoke":
        await query("UPDATE licenses SET status = 'blocked' WHERE id = ?", [id]);
        break;
      case "suspend":
        await query("UPDATE licenses SET status = 'suspended' WHERE id = ?", [id]);
        break;
      case "extend": {
        const days = Math.max(1, Math.min(365, parseInt(String(extend_days || 30), 10)));
        if (isNaN(days)) {
          return NextResponse.json({ error: "extend_days deve ser um numero valido" }, { status: 400 });
        }
        await query(
          `UPDATE licenses SET expires_at = datetime(expires_at, ? || ' days') WHERE id = ?`,
          [`+${days}`, id]
        );
        break;
      }
      case "block":
        await query("UPDATE licenses SET status = 'blocked' WHERE id = ?", [id]);
        break;
      case "reactivate":
        await query("UPDATE licenses SET status = 'active' WHERE id = ?", [id]);
        break;
      default:
        return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
    }

    const description = reason || `Acao ${action} realizada pelo admin`;
    await query(
      `INSERT INTO license_events (license_id, event_type, payload, created_at) VALUES (?, ?, ?, datetime('now'))`,
      [id, action, JSON.stringify({ reason: description })]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("License PATCH error:", error);
    return NextResponse.json({ error: "Erro ao atualizar licenca" }, { status: 500 });
  }
}
