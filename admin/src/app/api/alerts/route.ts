import { NextRequest, NextResponse } from "next/server";
import { query, initDatabase } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    const { searchParams } = new URL(request.url);
    const severity = searchParams.get("severity") || "";
    const resolved = searchParams.get("resolved") || "";

    let sql = `
      SELECT sa.id, sa.license_id, sa.alert_type, sa.severity, sa.ip_address,
        sa.description, sa.resolved, sa.created_at, l.serial as license_serial
      FROM security_alerts sa LEFT JOIN licenses l ON sa.license_id = l.id WHERE 1=1
    `;
    const params: any[] = [];

    if (severity) {
      sql += ` AND sa.severity = ?`;
      params.push(severity);
    }
    if (resolved !== "") {
      sql += ` AND sa.resolved = ?`;
      params.push(resolved === "true" ? 1 : 0);
    }

    sql += ` ORDER BY sa.created_at DESC LIMIT 100`;

    const result = await query(sql, params);
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Alerts GET error:", error);
    return NextResponse.json({ error: "Erro ao carregar alertas" }, { status: 500 });
  }
}
