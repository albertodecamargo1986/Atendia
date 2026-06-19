import { useState, useEffect } from 'react';
import api from '../services/api';
import { CreditCard, ChevronLeft, ChevronRight, Search, Loader2 } from 'lucide-react';

const statusColors: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-700', PENDING: 'bg-yellow-100 text-yellow-700',
  REJECTED: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-600',
  REFUNDED: 'bg-orange-100 text-orange-700', CHARGED_BACK: 'bg-red-100 text-red-700',
};

export default function AdminPaymentsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => { fetchPayments(); }, [page]);

  async function fetchPayments() {
    setLoading(true);
    try {
      const { data: res } = await api.get(`/admin/payments?page=${page}`);
      setData(res);
    } catch {}
    finally { setLoading(false); }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Pagamentos</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Histórico de pagamentos do sistema</p>
      </div>

      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-tertiary)] border-b border-[var(--border-color)]">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Valor</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Plano</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Período</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Gateway</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {data?.payments.map((p: any) => (
                <tr key={p.id} className="hover:bg-[var(--surface-tertiary)] transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--text-primary)]">{p.customer?.name || '—'}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{p.customer?.email}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">R$ {p.amount.toFixed(2)}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{p.plan}</span></td>
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">{p.periodMonths}m</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">{p.gateway}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status] || ''}`}>{p.status}</span></td>
                  <td className="px-4 py-3 text-xs text-[var(--text-tertiary)]">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
            <p className="text-xs text-[var(--text-tertiary)]">Página {page} de {data.totalPages} ({data.total} registros)</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg hover:bg-[var(--surface-tertiary)] disabled:opacity-50 text-[var(--text-secondary)]"><ChevronLeft size={16} /></button>
              <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg hover:bg-[var(--surface-tertiary)] disabled:opacity-50 text-[var(--text-secondary)]"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
