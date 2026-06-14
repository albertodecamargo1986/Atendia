import { NextRequest, NextResponse } from "next/server";
import { query, initDatabase } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    let sql = `
      SELECT c.id, c.name, c.cpf_cnpj, c.phone, c.email, c.created_at,
             (SELECT COUNT(*) FROM licenses l WHERE l.customer_id = c.id) as license_count
      FROM customers c WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      sql += ` AND (c.name LIKE ? OR c.email LIKE ? OR c.cpf_cnpj LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY c.created_at DESC`;

    const result = await query(sql, params);
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Customers GET error:", error);
    return NextResponse.json({ error: "Erro ao carregar clientes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json();
    const { name, email, cpf_cnpj, phone } = body;

    if (!name || !email) {
      return NextResponse.json({ error: "Nome e email obrigatorios" }, { status: 400 });
    }

    const result = await query(
      "INSERT INTO customers (name, email, cpf_cnpj, phone) VALUES (?, ?, ?, ?)",
      [name, email, cpf_cnpj || "", phone || ""]
    );

    return NextResponse.json({ success: true, data: { id: result.rows[0].id } }, { status: 201 });
  } catch (error: any) {
    if (error.message?.includes("UNIQUE")) {
      return NextResponse.json({ error: "Email ja existe" }, { status: 409 });
    }
    console.error("Customer POST error:", error);
    return NextResponse.json({ error: "Erro ao criar cliente" }, { status: 500 });
  }
}
