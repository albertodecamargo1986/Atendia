import { NextRequest, NextResponse } from "next/server";
import { query, initDatabase } from "@/lib/db";
import crypto from "crypto";

const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateSerial(): string {
  const segments = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => CHARS[crypto.randomInt(CHARS.length)]).join("")
  );
  return `ATND-${segments.join("-")}`;
}

const PLAN_DURATIONS: Record<string, number> = {
  monthly: 30,
  quarterly: 90,
  semiannual: 180,
  annual: 365,
};

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const plan = searchParams.get("plan") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1=1";
    const params: any[] = [];

    if (search) {
      whereClause += ` AND (l.serial LIKE ? OR c.email LIKE ? OR c.name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      whereClause += ` AND l.status = ?`;
      params.push(status);
    }
    if (plan) {
      whereClause += ` AND l.plan = ?`;
      params.push(plan);
    }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM licenses l JOIN customers c ON l.customer_id = c.id ${whereClause}`,
      params
    );
    const total = (countResult.rows[0]?.total as number) || 0;

    const result = await query(
      `SELECT l.id, l.serial, l.plan, l.status, l.expires_at, l.hwid,
        l.activation_count, l.last_validation, l.created_at,
        c.name as customer_name, c.email as customer_email
       FROM licenses l
       JOIN customers c ON l.customer_id = c.id
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      success: true,
      data: {
        licenses: result.rows,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Licenses GET error:", error);
    return NextResponse.json({ error: "Erro ao carregar licencas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json();
    const { customer_id, plan } = body;

    if (!customer_id || !plan) {
      return NextResponse.json({ error: "customer_id e plan obrigatorios" }, { status: 400 });
    }

    const serial = generateSerial();
    const days = PLAN_DURATIONS[plan] || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const result = await query(
      `INSERT INTO licenses (customer_id, serial, plan, status, expires_at, created_at)
       VALUES (?, ?, ?, 'active', ?, datetime('now'))`,
      [customer_id, serial, plan, expiresAt.toISOString()]
    );

    return NextResponse.json({ success: true, data: { id: result.rows[0].id, serial } }, { status: 201 });
  } catch (error) {
    console.error("License POST error:", error);
    return NextResponse.json({ error: "Erro ao criar licenca" }, { status: 500 });
  }
}
