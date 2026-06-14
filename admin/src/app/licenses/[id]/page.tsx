"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Key,
  User,
  Clock,
  Cpu,
  Activity,
  Shield,
  Ban,
  Pause,
  CalendarPlus,
  ShieldBan,
} from "lucide-react";

interface LicenseDetail {
  id: string;
  serial: string;
  customer_name: string;
  customer_email: string;
  plan: string;
  status: string;
  hwid: string | null;
  activation_count: number;
  transfer_count: number;
  activated_at: string | null;
  expires_at: string;
  last_validation: string | null;
  created_at: string;
  events: Array<{
    id: string;
    event_type: string;
    ip_address: string | null;
    hwid: string | null;
    created_at: string;
  }>;
  alerts: Array<{
    id: string;
    alert_type: string;
    severity: string;
    description: string;
    created_at: string;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  expired: "bg-red-100 text-red-700",
  suspended: "bg-yellow-100 text-yellow-700",
  blocked: "bg-gray-100 text-gray-700",
};

const PLAN_LABELS: Record<string, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export default function LicenseDetailPage() {
  const { id } = useParams();
  const [license, setLicense] = useState<LicenseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/licenses/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setLicense(data.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!license) {
    return <div className="text-center text-gray-500 py-8">Licenca nao encontrada</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/licenses" className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Detalhes da Licenca</h1>
      </div>

      {/* License Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="flex items-center gap-3">
            <Key className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-xs text-gray-500">Serial</p>
              <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">{license.serial}</code>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-xs text-gray-500">Cliente</p>
              <p className="text-sm font-medium text-gray-900">{license.customer_name}</p>
              <p className="text-xs text-gray-500">{license.customer_email}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500">Plano</p>
            <p className="text-sm font-medium text-gray-900">{PLAN_LABELS[license.plan]}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[license.status]}`}>
              {license.status}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-xs text-gray-500">Expira em</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date(license.expires_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-xs text-gray-500">HWID</p>
              <code className="text-xs font-mono text-gray-700 max-w-[200px] truncate block">
                {license.hwid || "Nao registrado"}
              </code>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500">Ativacoes</p>
            <p className="text-sm font-medium text-gray-900">{license.activation_count}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Transferencias</p>
            <p className="text-sm font-medium text-gray-900">{license.transfer_count} / 2 por ano</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Ultima Validacao</p>
            <p className="text-sm font-medium text-gray-900">
              {license.last_validation ? new Date(license.last_validation).toLocaleString("pt-BR") : "Nunca"}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-6 pt-6 border-t border-gray-100">
          <button className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg">
            <Ban className="w-3 h-3" /> Revogar
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 text-xs text-yellow-600 hover:bg-yellow-50 rounded-lg">
            <Pause className="w-3 h-3" /> Suspender
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 text-xs text-green-600 hover:bg-green-50 rounded-lg">
            <CalendarPlus className="w-3 h-3" /> Estender
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">
            <ShieldBan className="w-3 h-3" /> Bloqueio Imediato
          </button>
        </div>
      </div>

      {/* Event History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" /> Historico de Eventos
        </h2>
        <div className="space-y-2">
          {license.events?.map((event) => (
            <div key={event.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <div className="flex-1 flex items-center gap-4">
                <span className="text-sm text-gray-700">{event.event_type}</span>
                {event.ip_address && (
                  <span className="text-xs text-gray-500 font-mono">IP: {event.ip_address}</span>
                )}
                {event.hwid && (
                  <span className="text-xs text-gray-500 font-mono">HWID: {event.hwid.substring(0, 12)}...</span>
                )}
              </div>
              <span className="text-xs text-gray-400">
                {new Date(event.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
          {(!license.events || license.events.length === 0) && (
            <p className="text-sm text-gray-400">Nenhum evento registrado</p>
          )}
        </div>
      </div>

      {/* Security Alerts */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-orange-500" /> Alertas de Seguranca
        </h2>
        <div className="space-y-2">
          {license.alerts?.map((alert) => (
            <div key={alert.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
              <div className={`w-2 h-2 rounded-full ${alert.severity === 'critical' ? 'bg-red-500' : alert.severity === 'high' ? 'bg-orange-500' : alert.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'}`} />
              <div className="flex-1">
                <p className="text-sm text-gray-700">{alert.alert_type}: {alert.description}</p>
              </div>
              <span className="text-xs text-gray-400">
                {new Date(alert.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
          {(!license.alerts || license.alerts.length === 0) && (
            <p className="text-sm text-gray-400">Nenhum alerta registrado</p>
          )}
        </div>
      </div>
    </div>
  );
}
