"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Search,
  Filter,
  Eye,
  CheckCircle,
} from "lucide-react";

interface SecurityAlert {
  id: string;
  license_id: string | null;
  license_serial: string | null;
  alert_type: string;
  severity: string;
  description: string;
  raw_data: any;
  ip_address: string | null;
  resolved: boolean;
  created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Media",
  high: "Alta",
  critical: "Critica",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterResolved, setFilterResolved] = useState("");
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterSeverity) params.set("severity", filterSeverity);
    if (filterResolved) params.set("resolved", filterResolved);

    fetch(`/api/alerts?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setAlerts(data.data || []);
      })
      .finally(() => setLoading(false));
  }, [filterSeverity, filterResolved]);

  async function handleResolve(alertId: string) {
    try {
      await fetch(`/api/alerts/${alertId}/resolve`, { method: "PATCH" });
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, resolved: true } : a))
      );
    } catch (err) {
      console.error("Resolve failed:", err);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Alertas de Seguranca</h1>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="">Todas Severidades</option>
            <option value="low">Baixa</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="critical">Critica</option>
          </select>
          <select
            value={filterResolved}
            onChange={(e) => setFilterResolved(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="">Todos</option>
            <option value="false">Nao Resolvidos</option>
            <option value="true">Resolvidos</option>
          </select>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Data/Hora</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Serial</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Tipo</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Severidade</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">IP</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Descricao</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    Carregando...
                  </td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    Nenhum alerta encontrado
                  </td>
                </tr>
              ) : (
                alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(alert.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      {alert.license_serial ? (
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                          {alert.license_serial}
                        </code>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {alert.alert_type}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.low}`}
                      >
                        {SEVERITY_LABELS[alert.severity] || alert.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {alert.ip_address || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">
                      {alert.description}
                    </td>
                    <td className="px-4 py-3">
                      {alert.resolved ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3 h-3" /> Resolvido
                        </span>
                      ) : (
                        <span className="text-xs text-yellow-600">Pendente</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedAlert(alert)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                          title="Ver detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {!alert.resolved && (
                          <button
                            onClick={() => handleResolve(alert.id)}
                            className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50"
                            title="Marcar como resolvido"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Detalhes do Alerta
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500">Tipo</p>
                <p className="text-sm text-gray-900">{selectedAlert.alert_type}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Severidade</p>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[selectedAlert.severity]}`}
                >
                  {SEVERITY_LABELS[selectedAlert.severity]}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500">Descricao</p>
                <p className="text-sm text-gray-900">{selectedAlert.description}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">IP</p>
                <p className="text-sm text-gray-900 font-mono">{selectedAlert.ip_address || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Data/Hora</p>
                <p className="text-sm text-gray-900">
                  {new Date(selectedAlert.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              {selectedAlert.raw_data && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Dados Brutos (JSON)</p>
                  <pre className="bg-gray-50 p-3 rounded-lg text-xs text-gray-700 overflow-x-auto">
                    {JSON.stringify(selectedAlert.raw_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setSelectedAlert(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
