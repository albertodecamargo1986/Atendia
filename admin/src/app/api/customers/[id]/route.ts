import { NextRequest, NextResponse } from "next/server";
import { query, initDatabase } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDatabase();
    const { id } = params;

    const customerResult = await query("SELECT * FROM customers WHERE id = ?", [id]);
    if (!customerResult.rows[0]) {
      return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
    }

    const licensesResult = await query(
      "SELECT id, serial, plan, status, expires_at, created_at FROM licenses WHERE customer_id = ? ORDER BY created_at DESC",
      [id]
    );

    const eventsResult = await query(
      `SELECT le.id, le.event_type, le.created_at
       FROM license_events le
       JOIN licenses l ON l.id = le.license_id
       WHERE l.customer_id = ? ORDER BY le.created_at DESC LIMIT 50`,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: {
        ...customerResult.rows[0],
        licenses: licensesResult.rows,
        events: eventsResult.rows,
      },
    });
  } catch (error) {
    console.error("Customer GET error:", error);
    return NextResponse.json({ error: "Erro ao carregar cliente" }, { status: 500 });
  }
}
