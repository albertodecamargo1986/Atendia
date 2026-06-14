import { useState, useEffect } from 'react';
import { Key, Shield, Clock, RefreshCw, AlertTriangle, Check, Copy } from 'lucide-react';
import api from '../services/api';

interface License {
  id: string;
  serial: string;
  plan: string;
  status: string;
  expiresAt: string;
  activatedAt: string | null;
  lastSeenAt: string | null;
  hwid: string | null;
  transferCount: number;
  createdAt: string;
  customer: { name: string; email: string };
  payments: { id: string; amount: number; status: string; plan: string; createdAt: string }[];
}

const planLabels: Record<string, string> = {
  STARTER: 'Starter',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
};

const statusLabels: Record<string, { label: string; color: string }> = {
  INACTIVE: { label: 'Inativa', color: 'bg-gray-100 text-gray-700' },
  ACTIVE: { label: 'Ativa', color: 'bg-green-100 text-green-700' },
  EXPIRED: { label: 'Expirada', color: 'bg-red-100 text-red-700' },
  REVOKED: { label: 'Revogada', color: 'bg-red-100 text-red-700' },
  SUSPENDED: { label: 'Suspensa', color: 'bg-yellow-100 text-yellow-700' },
};

export default function LicensePage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedSerial, setCopiedSerial] = useState<string | null>(null);

  useEffect(() => {
    fetchLicenses();
  }, []);

  async function fetchLicenses() {
    try {
      setLoading(true);
      const res = await api.get('/license');
      setLicenses(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar licenças');
    } finally {
      setLoading(false);
    }
  }

  function copySerial(serial: string) {
    navigator.clipboard.writeText(serial);
    setCopiedSerial(serial);
    setTimeout(() => setCopiedSerial(null), 2000);
  }

  function formatDate(date: string | null) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function daysUntilExpiry(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Key size={28} className="text-indigo-600" />
          Minha Licença
        </h1>
        <p className="text-gray-500 mt-1">Gerencie sua licença e acompanhe o status</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {licenses.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Key size={48} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Nenhuma licença encontrada
          </h2>
          <p className="text-gray-500 mb-6">
            Adquira uma licença para desbloquear todos os recursos do AtendIA.
          </p>
          <a
            href="https://atend-ia.com/#precos"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Ver Planos
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {licenses.map((license) => {
            const statusInfo = statusLabels[license.status] || statusLabels.INACTIVE;
            const daysLeft = daysUntilExpiry(license.expiresAt);
            const isExpiringSoon = daysLeft > 0 && daysLeft <= 7;
            const isExpired = daysLeft <= 0;

            return (
              <div key={license.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <span className="text-sm font-medium text-gray-500">
                        Plano {planLabels[license.plan] || license.plan}
                      </span>
                    </div>
                    {isExpiringSoon && (
                      <span className="flex items-center gap-1 text-yellow-600 text-sm">
                        <AlertTriangle size={16} />
                        Expira em {daysLeft} dias
                      </span>
                    )}
                    {isExpired && license.status === 'ACTIVE' && (
                      <span className="flex items-center gap-1 text-red-600 text-sm">
                        <AlertTriangle size={16} />
                        Expirada
                      </span>
                    )}
                  </div>
                </div>

                {/* Serial */}
                <div className="p-6">
                  <div className="p-4 bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-lg text-center mb-6">
                    <p className="text-xs font-medium text-indigo-600 mb-1">CHAVE SERIAL</p>
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-xl font-bold tracking-widest text-indigo-700 font-mono">
                        {license.serial}
                      </p>
                      <button
                        onClick={() => copySerial(license.serial)}
                        className="p-1.5 rounded-md hover:bg-indigo-100 transition-colors"
                        title="Copiar serial"
                      >
                        {copiedSerial === license.serial ? (
                          <Check size={16} className="text-green-600" />
                        ) : (
                          <Copy size={16} className="text-indigo-500" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                        <Clock size={14} />
                        Expira em
                      </div>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatDate(license.expiresAt)}
                      </p>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                        <Shield size={14} />
                        Ativada em
                      </div>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatDate(license.activatedAt)}
                      </p>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                        <RefreshCw size={14} />
                        Transferências
                      </div>
                      <p className="text-sm font-semibold text-gray-900">
                        {license.transferCount} / 2 por ano
                      </p>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                        <Key size={14} />
                        Última atividade
                      </div>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatDate(license.lastSeenAt)}
                      </p>
                    </div>
                  </div>

                  {/* Payments */}
                  {license.payments.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Histórico de Pagamentos</h3>
                      <div className="space-y-2">
                        {license.payments.map((payment) => (
                          <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                            <div>
                              <span className="font-medium text-gray-900">
                                {planLabels[license.plan] || license.plan}
                              </span>
                              <span className="text-gray-400 mx-2">·</span>
                              <span className="text-gray-500">{formatDate(payment.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-gray-900">
                                R${payment.amount.toFixed(2)}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                payment.status === 'APPROVED'
                                  ? 'bg-green-100 text-green-700'
                                  : payment.status === 'PENDING'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {payment.status === 'APPROVED' ? 'Aprovado' : payment.status === 'PENDING' ? 'Pendente' : payment.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {(license.status === 'EXPIRED' || isExpiringSoon) && (
                  <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      {isExpired ? 'Sua licença expirou. Renove para continuar usando.' : 'Sua licença expira em breve. Renove agora.'}
                    </p>
                    <a
                      href="https://atend-ia.com/#precos"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                    >
                      Renovar Licença
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
