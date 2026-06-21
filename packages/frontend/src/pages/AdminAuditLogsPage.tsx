import { useState, useEffect } from 'react';
import api from '../services/api';
import {
  ClipboardList, Search, ChevronLeft, ChevronRight, Loader2, Clock, Filter,
} from 'lucide-react';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: any;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

interface AuditResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-purple-100 text-purple-700',
  UPGRADE: 'bg-yellow-100 text-yellow-700',
  RESET_PASSWORD: 'bg-orange-100 text-orange-700',
};

export default function AdminAuditLogsPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => { fetchLogs(); }, [page, actionFilter]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (actionFilter) params.set('action', actionFilter);
      const { data: res } = await api.get(`/admin/audit-logs?${params}`);
      setData(res);
    } catch {}
    finally { setLoading(false); }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR');
  }

  const actions = ['', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'UPGRADE', 'RESET_PASSWORD'];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <ClipboardList size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Logs de Auditoria</h1>
            <p className="text-sm text-[var(--text-secondary)]">Histórico de ações administrativas</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-[var(--text-tertiary)]" />
          <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none">
            {actions.map(a => (
              <option key={a} value={a}>{a || 'Todas ações'}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--surface-tertiary)]">
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">Data</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">Ação</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">Entidade</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">Usuário</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12"><Loader2 size={24} className="animate-spin mx-auto text-purple-600" /></td></tr>
              ) : !data?.logs.length ? (
                <tr><td colSpan={5} className="text-center py-12 text-[var(--text-tertiary)]">Nenhum log encontrado</td></tr>
              ) : data.logs.map(log => (
                <tr key={log.id} className="border-b border-[var(--border-color)] hover:bg-[var(--surface-tertiary)] transition">
                  <td className="px-4 py-3 text-xs text-[var(--text-tertiary)] whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Clock size={12} /> {formatDate(log.createdAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-[var(--text-primary)]">{log.entity}</span>
                    {log.entityId && <span className="text-xs text-[var(--text-tertiary)] ml-1">({log.entityId.substring(0, 8)})</span>}
                  </td>
                  <td className="px-4 py-3">
                    {log.user ? (
                      <div>
                        <p className="text-sm text-[var(--text-primary)]">{log.user.name}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">{log.user.email}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--text-tertiary)]">Sistema</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {log.details ? (
                      <pre className="text-xs text-[var(--text-tertiary)] max-w-xs truncate">
                        {JSON.stringify(log.details).substring(0, 80)}
                      </pre>
                    ) : (
                      <span className="text-xs text-[var(--text-tertiary)]">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
            <p className="text-xs text-[var(--text-tertiary)]">Página {page} de {data.totalPages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-tertiary)] disabled:opacity-50">
                <ChevronLeft size={16} />
              </button>
              <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-tertiary)] disabled:opacity-50">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
