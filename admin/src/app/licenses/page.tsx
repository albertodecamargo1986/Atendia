"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  Ban,
  Pause,
  CalendarPlus,
  ShieldBan,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";

interface License {
  id: string;
  serial: string;
  customer_name: string;
  customer_email: string;
  plan: string;
  status: string;
  expires_at: string;
  hwid: string | null;
  activation_count: number;
  last_validation: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  expired: "bg-red-100 text-red-700",
  suspended: "bg-yellow-100 text-yellow-700",
  blocked: "bg-gray-100 text-gray-700",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  expired: "Expirada",
  suspended: "Suspensa",
  blocked: "Bloqueada",
};

const PLAN_LABELS: Record<string, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPlan, setFilterPlan] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionModal, setActionModal] = useState<{
    type: string;
    license: License;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: "20",
      ...(search && { search }),
      ...(filterStatus && { status: filterStatus }),
      ...(filterPlan && { plan: filterPlan }),
    });

    fetch(`/api/licenses?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setLicenses(data.data.licenses || []);
          setTotalPages(data.data.totalPages || 1);
        }
      })
      .finally(() => setLoading(false));
  }, [page, search, filterStatus, filterPlan]);

  async function handleAction(type: string, licenseId: string) {
    try {
      const res = await fetch(`/api/licenses/${licenseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: type }),
      });
      if (res.ok) {
        setLicenses((prev) =>
          prev.map((l) =>
            l.id === licenseId
              ? {
                  ...l,
                  status:
                    type === "revoke"
                      ? "blocked"
                      : type === "suspend"
                        ? "suspended"
                        : l.status,
                }
              : l
          )
        );
        setActionModal(null);
      }
    } catch (err) {
      console.error("Action failed:", err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Licencas</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por serial, nome ou e-mail..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="">Todos Status</option>
            <option value="active">Ativa</option>
            <option value="expired">Expirada</option>
            <option value="suspended">Suspensa</option>
            <option value="blocked">Bloqueada</option>
          </select>
          <select
            value={filterPlan}
            onChange={(e) => {
              setFilterPlan(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="">Todos Planos</option>
            <option value="monthly">Mensal</option>
            <option value="quarterly">Trimestral</option>
            <option value="semiannual">Semestral</option>
            <option value="annual">Anual</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Serial</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Plano</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Expiracao</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">HWID</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Ativacoes</th>
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
              ) : licenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    Nenhuma licenca encontrada
                  </td>
                </tr>
              ) : (
                licenses.map((license) => (
                  <tr key={license.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                        {license.serial}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {license.customer_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {license.customer_email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {PLAN_LABELS[license.plan] || license.plan}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {new Date(license.expires_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[license.status] || STATUS_COLORS.active}`}
                      >
                        {STATUS_LABELS[license.status] || license.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono max-w-[120px] truncate">
                      {license.hwid || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {license.activation_count}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/licenses/${license.id}`}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                          title="Ver detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() =>
                            setActionModal({ type: "revoke", license })
                          }
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                          title="Revogar"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            setActionModal({ type: "suspend", license })
                          }
                          className="p-1.5 text-gray-400 hover:text-yellow-600 rounded-lg hover:bg-yellow-50"
                          title="Suspender"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            setActionModal({ type: "extend", license })
                          }
                          className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50"
                          title="Estender prazo"
                        >
                          <CalendarPlus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            setActionModal({ type: "block", license })
                          }
                          className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                          title="Bloqueio imediato"
                        >
                          <ShieldBan className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          <span className="text-sm text-gray-500">
            Pagina {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
          >
            Proximo <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {actionModal.type === "revoke" && "Revogar Licenca"}
              {actionModal.type === "suspend" && "Suspender Licenca"}
              {actionModal.type === "extend" && "Estender Prazo"}
              {actionModal.type === "block" && "Bloqueio Imediato"}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {actionModal.type === "revoke" &&
                `Tem certeza que deseja revogar a licenca ${actionModal.license.serial}? Esta acao e irreversivel.`}
              {actionModal.type === "suspend" &&
                `Tem certeza que deseja suspender a licenca ${actionModal.license.serial}?`}
              {actionModal.type === "extend" &&
                `Extensao de prazo para a licenca ${actionModal.license.serial}. Adicionar dias:`}
              {actionModal.type === "block" &&
                `Bloqueio imediato da licenca ${actionModal.license.serial}. O software sera desconectado na proxima validacao.`}
            </p>
            {actionModal.type === "extend" && (
              <input
                type="number"
                defaultValue={30}
                min={1}
                max={365}
                id="extend-days"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-4"
                placeholder="Dias a adicionar"
              />
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleAction(actionModal.type, actionModal.license.id)}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
