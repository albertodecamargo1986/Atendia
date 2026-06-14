import { NextResponse } from "next/server";
import { query, initDatabase } from "@/lib/db";

export async function GET() {
  try {
    await initDatabase();

    const activeResult = await query(
      "SELECT COUNT(*) as count FROM licenses WHERE status = 'active'"
    );
    const activeLicenses = (activeResult.rows[0]?.count as number) || 0;

    const expiredResult = await query(
      "SELECT COUNT(*) as count FROM licenses WHERE status = 'expired'"
    );
    const expiredLicenses = (expiredResult.rows[0]?.count as number) || 0;

    const revenueResult = await query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid' AND paid_at >= date('now', 'start of month')"
    );
    const monthlyRevenue = (revenueResult.rows[0]?.total as number) || 0;

    const newCustomersResult = await query(
      "SELECT COUNT(*) as count FROM customers WHERE created_at >= datetime('now', '-30 days')"
    );
    const newCustomers = (newCustomersResult.rows[0]?.count as number) || 0;

    const alertsResult = await query(
      "SELECT COUNT(*) as count FROM security_alerts WHERE severity IN ('high', 'critical')"
    );
    const securityBreachAttempts = (alertsResult.rows[0]?.count as number) || 0;

    // Sales over last 12 months (SQLite)
    const salesResult = await query(
      `SELECT strftime('%Y-%m', created_at) as month, COALESCE(SUM(amount), 0) as total
       FROM payments WHERE status = 'paid' AND created_at >= datetime('now', '-12 months')
       GROUP BY strftime('%Y-%m', created_at) ORDER BY month`
    );

    const salesOverTime = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const found = salesResult.rows.find((r: any) => r.month === key);
      salesOverTime.push({
        month: key,
        label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        total: found ? (found.total as number) : 0,
      });
    }

    // Recent activity
    const activityResult = await query(
      `SELECT 'license_created' as event_type, l.serial as detail, c.name as customer_name, l.created_at
       FROM licenses l JOIN customers c ON l.customer_id = c.id
       ORDER BY l.created_at DESC LIMIT 5`
    );

    return NextResponse.json({
      activeLicenses,
      expiredLicenses,
      monthlyRevenue,
      newCustomers,
      securityBreachAttempts,
      salesOverTime,
      recentActivity: activityResult.rows,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Erro ao carregar dados do dashboard" },
      { status: 500 }
    );
  }
}
