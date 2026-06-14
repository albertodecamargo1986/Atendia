"use client";

import { useState } from "react";
import { Save, DollarSign, Mail, CreditCard, Server, Shield } from "lucide-react";

interface Settings {
  plans: {
    monthly: number;
    quarterly: number;
    semiannual: number;
    annual: number;
  };
  emailTemplate: {
    subject: string;
    bodyHtml: string;
  };
  paymentGateways: {
    stripe_secret_key: string;
    stripe_webhook_secret: string;
    mp_access_token: string;
    mp_webhook_url: string;
  };
  emailServer: {
    provider: string;
    resend_api_key: string;
    smtp_host: string;
    smtp_port: string;
    smtp_user: string;
    smtp_pass: string;
  };
  security: {
    transfer_limit_per_year: number;
    offline_tolerance_days: number;
    heartbeat_interval_hours: number;
  };
}

const tabs = [
  { id: "plans", label: "Planos", icon: DollarSign },
  { id: "email", label: "E-mail", icon: Mail },
  { id: "payment", label: "Pagamentos", icon: CreditCard },
  { id: "smtp", label: "Servidor SMTP", icon: Server },
  { id: "security", label: "Seguranca", icon: Shield },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("plans");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [plans, setPlans] = useState({
    monthly: 147,
    quarterly: 381,
    semiannual: 642,
    annual: 1044,
  });

  const [emailTemplate, setEmailTemplate] = useState({
    subject: "Sua Licenca AtendIA - Serial de Ativacao",
    bodyHtml: "",
  });

  const [paymentGateways, setPaymentGateways] = useState({
    stripe_secret_key: "",
    stripe_webhook_secret: "",
    mp_access_token: "",
    mp_webhook_url: "",
  });

  const [emailServer, setEmailServer] = useState({
    provider: "resend",
    resend_api_key: "",
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_pass: "",
  });

  const [security, setSecurity] = useState({
    transfer_limit_per_year: 2,
    offline_tolerance_days: 7,
    heartbeat_interval_hours: 4,
  });

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plans,
          emailTemplate,
          paymentGateways,
          emailServer,
          security,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Save settings failed:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Configuracoes</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar Alteracoes"}
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {activeTab === "plans" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Precos dos Planos (R$)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mensal</label>
                <input
                  type="number"
                  value={plans.monthly}
                  onChange={(e) => setPlans({ ...plans, monthly: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trimestral</label>
                <input
                  type="number"
                  value={plans.quarterly}
                  onChange={(e) => setPlans({ ...plans, quarterly: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Semestral</label>
                <input
                  type="number"
                  value={plans.semiannual}
                  onChange={(e) => setPlans({ ...plans, semiannual: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Anual</label>
                <input
                  type="number"
                  value={plans.annual}
                  onChange={(e) => setPlans({ ...plans, annual: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "email" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Template de E-mail</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assunto</label>
              <input
                type="text"
                value={emailTemplate.subject}
                onChange={(e) => setEmailTemplate({ ...emailTemplate, subject: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Corpo HTML</label>
              <textarea
                value={emailTemplate.bodyHtml}
                onChange={(e) => setEmailTemplate({ ...emailTemplate, bodyHtml: e.target.value })}
                rows={12}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                placeholder="Template HTML do e-mail de serial..."
              />
            </div>
          </div>
        )}

        {activeTab === "payment" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Gateways de Pagamento</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900">Stripe</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
                  <input
                    type="password"
                    value={paymentGateways.stripe_secret_key}
                    onChange={(e) => setPaymentGateways({ ...paymentGateways, stripe_secret_key: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                    placeholder="sk_live_..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Webhook Secret</label>
                  <input
                    type="password"
                    value={paymentGateways.stripe_webhook_secret}
                    onChange={(e) => setPaymentGateways({ ...paymentGateways, stripe_webhook_secret: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                    placeholder="whsec_..."
                  />
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900">Mercado Pago</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
                  <input
                    type="password"
                    value={paymentGateways.mp_access_token}
                    onChange={(e) => setPaymentGateways({ ...paymentGateways, mp_access_token: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                    placeholder="APP_USR-..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                  <input
                    type="text"
                    value={paymentGateways.mp_webhook_url}
                    onChange={(e) => setPaymentGateways({ ...paymentGateways, mp_webhook_url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="https://atend-ia.com/api/webhook/mercadopago"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "smtp" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Servidor de E-mail</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provedor</label>
              <select
                value={emailServer.provider}
                onChange={(e) => setEmailServer({ ...emailServer, provider: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              >
                <option value="resend">Resend</option>
                <option value="smtp">SMTP Customizado</option>
              </select>
            </div>
            {emailServer.provider === "resend" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resend API Key</label>
                <input
                  type="password"
                  value={emailServer.resend_api_key}
                  onChange={(e) => setEmailServer({ ...emailServer, resend_api_key: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                  placeholder="re_..."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
                  <input
                    type="text"
                    value={emailServer.smtp_host}
                    onChange={(e) => setEmailServer({ ...emailServer, smtp_host: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Porta</label>
                  <input
                    type="text"
                    value={emailServer.smtp_port}
                    onChange={(e) => setEmailServer({ ...emailServer, smtp_port: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                  <input
                    type="text"
                    value={emailServer.smtp_user}
                    onChange={(e) => setEmailServer({ ...emailServer, smtp_user: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                  <input
                    type="password"
                    value={emailServer.smtp_pass}
                    onChange={(e) => setEmailServer({ ...emailServer, smtp_pass: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "security" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Configuracoes de Seguranca</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Limite de Transferencias/Ano
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={security.transfer_limit_per_year}
                  onChange={(e) => setSecurity({ ...security, transfer_limit_per_year: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tolerancia Offline (dias)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={security.offline_tolerance_days}
                  onChange={(e) => setSecurity({ ...security, offline_tolerance_days: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Intervalo Heartbeat (horas)
                </label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={security.heartbeat_interval_hours}
                  onChange={(e) => setSecurity({ ...security, heartbeat_interval_hours: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
