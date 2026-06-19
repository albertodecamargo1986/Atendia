import { useState, useEffect } from 'react';
import api from '../services/api';
import { Key, Search, ChevronLeft, ChevronRight, X, Loader2, Plus, ShieldAlert, CheckCircle, XCircle, Clock } from 'lucide-react';

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700', INACTIVE: 'bg-gray-100 text-gray-600',
  EXPIRED: 'bg-yellow-100 text-yellow-700', REVOKED: 'bg-red-100 text-red-700', SUSPENDED: 'bg-orange-100 text-orange-700',
};

export default function AdminLicensesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ customerId: '', plan: 'STARTER', expiresAt: '' });
  const [customers, setCustomers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchLicenses(); }, [page, search]);

  async function fetchLicenses() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (search) params.set('search', search);
      const { data: res } = await api.get(`/admin/licenses?${params}`);
      setData(res);
    } catch { setError('Erro ao carregar licenças'); }
    finally { setLoading(false); }
  }

  async function fetchCustomers() {
    try {
      const { data: res } = await api.get('/admin/customers');
      setCustomers(res);
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/licenses', createForm);
      setShowCreate(false);
      setCreateForm({ customerId: '', plan: 'STARTER', expiresAt: '' });
      fetchLicenses();
    } catch { setError('Erro ao criar licença'); }
    finally { setSaving(false); }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Tem certeza que deseja revogar esta licença?')) return;
    try { await api.post(`/admin/licenses/${id}/revoke`); fetchLicenses(); }
    catch { setError('Erro ao revogar'); }
  }

  function openCreate() {
    fetchCustomers();
    const oneYear = new Date(); oneYear.setFullYear(oneYear.getFullYear() + 1);
    setCreateForm(f => ({ ...f, expiresAt: oneYear.toISOString().split('T')[0] }));
    setShowCreate(true);
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Licenças</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Gerencie as licenças do sistema</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition">
          <Plus size={18} /> Nova Licença
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex justify-between items-center"><span>{error}</span><button onClick={() => setError('')}><X size={16} /></button></div>}

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por serial, cliente ou email..." className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
      </div>

      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-tertiary)] border-b border-[var(--border-color)]">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Serial</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Plano</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Expira em</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Ativada em</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {data?.licenses.map((l: any) => (
                <tr key={l.id} className="hover:bg-[var(--surface-tertiary)] transition-colors">
                  <td className="px-4 py-3"><code className="text-xs font-mono text-[var(--text-primary)]">{l.serial}</code></td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--text-primary)]">{l.customer?.name || '—'}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{l.customer?.email}</p>
                  </td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{l.plan}</span></td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[l.status] || ''}`}>{l.status}</span></td>
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">{new Date(l.expiresAt).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-tertiary)]">{l.activatedAt ? new Date(l.activatedAt).toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="px-4 py-3">
                    {l.status === 'ACTIVE' && (
                      <button onClick={() => handleRevoke(l.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Revogar</button>
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
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg hover:bg-[var(--surface-tertiary)] disabled:opacity-50 text-[var(--text-secondary)]"><ChevronLeft size={16} /></button>
              <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg hover:bg-[var(--surface-tertiary)] disabled:opacity-50 text-[var(--text-secondary)]"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Nova Licença</h2>
                <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]"><X size={20} /></button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Cliente</label>
                  <select required value={createForm.customerId} onChange={e => setCreateForm(f => ({ ...f, customerId: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                    <option value="">Selecione um cliente</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Plano</label>
                  <select value={createForm.plan} onChange={e => setCreateForm(f => ({ ...f, plan: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                    <option value="STARTER">Starter</option>
                    <option value="PRO">Pro</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Data de Expiração</label>
                  <input type="date" required value={createForm.expiresAt} onChange={e => setCreateForm(f => ({ ...f, expiresAt: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface-secondary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">Cancelar</button>
                  <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                    Criar Licença
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
