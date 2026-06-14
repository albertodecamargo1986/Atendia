"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  User,
  Mail,
  Phone,
  FileText,
  Key,
  Send,
  Plus,
  History,
} from "lucide-react";

interface Customer {
  id: string;
  name: string;
  email: string;
  cpf_cnpj: string;
  phone: string;
  created_at: string;
  licenses: Array<{
    id: string;
    serial: string;
    plan: string;
    status: string;
    expires_at: string;
    created_at: string;
  }>;
  events: Array<{
    id: string;
    event_type: string;
    created_at: string;
    payload: any;
  }>;
}

const PLAN_LABELS: Record<string, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  expired: "bg-red-100 text-red-700",
  suspended: "bg-yellow-100 text-yellow-700",
  blocked: "bg-gray-100 text-gray-700",
};

export default function CustomerDetailPage() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddLicense, setShowAddLicense] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("monthly");

  const fetchCustomer = useCallback(() => {
    fetch(`/api/customers/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setCustomer(data.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  async function handleAddLicense() {
    try {
      const res = await fetch("/api/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: id, plan: selectedPlan }),
      });
      if (res.ok) {
        setShowAddLicense(false);
        fetchCustomer();
      }
    } catch (err) {
      console.error("Add license failed:", err);
    }
  }

  async function handleResendEmail(licenseId: string) {
    try {
      await fetch(`/api/licenses/${licenseId}/resend-email`, { method: "POST" });
      alert("E-mail reenviado com sucesso!");
    } catch (err) {
      console.error("Resend failed:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!customer) {
    return <div className="text-center text-gray-500 py-8">Cliente nao encontrado</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Detalhes do Cliente</h1>

      {/* Customer Info Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Nome</p>
              <p className="text-sm font-medium text-gray-900">{customer.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">E-mail</p>
              <p className="text-sm font-medium text-gray-900">{customer.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">CPF/CNPJ</p>
              <p className="text-sm font-medium text-gray-900 font-mono">{customer.cpf_cnpj}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Telefone</p>
              <p className="text-sm font-medium text-gray-900">{customer.phone}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowAddLicense(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Adicionar Licenca Manual
        </button>
      </div>

      {/* Licenses */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-blue-600" /> Licencas
        </h2>
        <div className="space-y-3">
          {customer.licenses?.map((license) => (
            <div
              key={license.id}
              className="flex items-center justify-between p-4 border border-gray-100 rounded-lg"
            >
              <div className="space-y-1">
                <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                  {license.serial}
                </code>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>{PLAN_LABELS[license.plan] || license.plan}</span>
                  <span className="text-gray-300">|</span>
                  <span>Expira: {new Date(license.expires_at).toLocaleDateString("pt-BR")}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[license.status] || STATUS_COLORS.active}`}
                  >
                    {license.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleResendEmail(license.id)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg"
              >
                <Send className="w-3 h-3" /> Reenviar E-mail
              </button>
            </div>
          ))}
          {(!customer.licenses || customer.licenses.length === 0) && (
            <p className="text-sm text-gray-400">Nenhuma licenca encontrada</p>
          )}
        </div>
      </div>

      {/* Activity Log */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-blue-600" /> Log de Atividades
        </h2>
        <div className="space-y-2">
          {customer.events?.map((event) => (
            <div key={event.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <div className="flex-1">
                <p className="text-sm text-gray-700">{event.event_type}</p>
                <p className="text-xs text-gray-400">
                  {new Date(event.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
          ))}
          {(!customer.events || customer.events.length === 0) && (
            <p className="text-sm text-gray-400">Nenhuma atividade registrada</p>
          )}
        </div>
      </div>

      {/* Add License Modal */}
      {showAddLicense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Adicionar Licenca Manual
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plano</label>
                <select
                  value={selectedPlan}
                  onChange={(e) => setSelectedPlan(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                >
                  <option value="monthly">Mensal - R$ 147</option>
                  <option value="quarterly">Trimestral - R$ 381</option>
                  <option value="semiannual">Semestral - R$ 642</option>
                  <option value="annual">Anual - R$ 1.044</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowAddLicense(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddLicense}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Criar Licenca
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
