"use client";

import { useEffect, useState } from "react";
import {
  KeyRound,
  XCircle,
  DollarSign,
  UserPlus,
  ShieldAlert,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DashboardData {
  activeLicenses: number;
  expiredLicenses: number;
  monthlyRevenue: number;
  newCustomers: number;
  securityBreachAttempts: number;
  salesOverTime: { month: string; label: string; total: number }[];
  recentActivity: {
    event_type: string;
    detail: string;
    customer_name: string;
    created_at: string;
  }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <h1 className="text-2xl font-bold text-dark-900 mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-dark-200 rounded w-24 mb-3" />
              <div className="h-8 bg-dark-200 rounded w-16" />
            </div>
          ))}
        </div>
        <div className="card animate-pulse h-72 mb-8" />
        <div className="card animate-pulse h-48" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-danger-500">Erro ao carregar dados do dashboard.</p>
      </div>
    );
  }

  const metrics = [
    {
      label: "Licenças Ativas",
      value: data.activeLicenses.toLocaleString("pt-BR"),
      icon: KeyRound,
      color: "text-accent-600",
      bg: "bg-accent-50",
    },
    {
      label: "Licenças Expiradas",
      value: data.expiredLicenses.toLocaleString("pt-BR"),
      icon: XCircle,
      color: "text-danger-600",
      bg: "bg-danger-50",
    },
    {
      label: "Receita Mensal",
      value: data.monthlyRevenue.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }),
      icon: DollarSign,
      color: "text-primary-600",
      bg: "bg-primary-50",
    },
    {
      label: "Novos Clientes (30d)",
      value: data.newCustomers.toLocaleString("pt-BR"),
      icon: UserPlus,
      color: "text-accent-600",
      bg: "bg-accent-50",
    },
    {
      label: "Tentativas de Violação",
      value: data.securityBreachAttempts.toLocaleString("pt-BR"),
      icon: ShieldAlert,
      color: "text-danger-600",
      bg: "bg-danger-50",
    },
  ];

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-2xl font-bold text-dark-900 mb-6">Dashboard</h1>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="card flex items-start justify-between">
              <div>
                <p className="text-sm text-dark-500 font-medium">{metric.label}</p>
                <p className={`text-2xl font-bold mt-1 ${metric.color}`}>
                  {metric.value}
                </p>
              </div>
              <div className={`${metric.bg} p-2.5 rounded-lg`}>
                <Icon className={`w-5 h-5 ${metric.color}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Sales Chart */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-dark-900 mb-4">
          Vendas nos Últimos 12 Meses
        </h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.salesOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "#64748B" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#64748B" }}
                tickLine={false}
                tickFormatter={(v: number) =>
                  `R$ ${(v / 1000).toFixed(0)}k`
                }
              />
              <Tooltip
                formatter={(value: number) =>
                  value.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })
                }
                labelStyle={{ color: "#0F172A" }}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#2563EB"
                strokeWidth={2}
                dot={{ r: 4, fill: "#2563EB" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-lg font-semibold text-dark-900 mb-4">
          Atividade Recente
        </h2>
        {data.recentActivity.length === 0 ? (
          <p className="text-dark-400 text-sm">Nenhuma atividade recente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-200">
                  <th className="table-header">Tipo</th>
                  <th className="table-header">Detalhe</th>
                  <th className="table-header">Cliente/Serial</th>
                  <th className="table-header">Data/Hora</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.map((activity, i) => (
                  <tr key={i} className="border-b border-dark-100 last:border-0">
                    <td className="table-cell">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          activity.event_type === "license_created"
                            ? "bg-accent-100 text-accent-800"
                            : activity.event_type === "security_alert"
                            ? "bg-danger-100 text-danger-800"
                            : "bg-primary-100 text-primary-800"
                        }`}
                      >
                        {activity.event_type === "license_created"
                          ? "Licença"
                          : activity.event_type === "security_alert"
                          ? "Alerta"
                          : activity.event_type}
                      </span>
                    </td>
                    <td className="table-cell font-mono text-xs">{activity.detail}</td>
                    <td className="table-cell">{activity.customer_name}</td>
                    <td className="table-cell text-dark-400">
                      {new Date(activity.created_at).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
