import { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Building2, Search, ChevronLeft, ChevronRight, CheckCircle, XCircle,
  Edit3, X, Save, Loader2,
} from 'lucide-react';

interface TenantData {
  id: string; name: string; slug: string; plan: string; isActive: boolean;
  maxAgents: number; maxConversations: number; maxWhatsapp: number; maxAiRequests: number;
  createdAt: string; updatedAt: string;
  _count: { users: number; agents: number; conversations: number; licenses: number };
  subscription: { status: string; currentPeriodEnd: string } | null;
}

interface TenantListResponse {
  tenants: TenantData[]; total: number; page: number; limit: number; totalPages: number;
}

const planOptions = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'];
const planColors: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-600', STARTER: 'bg-blue-100 text-blue-700',
  PRO: 'bg-purple-100 text-purple-700', ENTERPRISE: 'bg-yellow-100 text-yellow-700',
};

export default function AdminClientsPage() {
  const [data, setData] = useState<TenantListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [editData, setEditData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchTenants(); }, [page, search]);

  async function fetchTenants() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (search) params.set('search', search);
      const { data: res } = await api.get(`/admin/tenants?${params}`);
      setData(res);
    } catch { setError('Erro ao carregar tenants'); }
    finally { setLoading(false); }
  }

  async function fetchTenantDetail(id: string) {
    try {
      const { data: res } = await api.get(`/admin/tenants/${id}`);
      setSelectedTenant(res);
      setEditData({
        name: res.name, plan: res.plan, isActive: res.isActive,
        maxAgents: res.maxAgents, maxConversations: res.maxConversations,
        maxWhatsapp: res.maxWhatsapp, maxAiRequests: res.maxAiRequests,
      });
    } catch { setError('Erro ao carregar detalhes'); }
  }

  async function handleSave() {
    if (!selectedTenant) return;
    setSaving(true);
    try {
      await api.patch(`/admin/tenants/${selectedTenant.id}`, editData);
      fetchTenantDetail(selectedTenant.id);
      fetchTenants();
    } catch { setError('Erro ao salvar'); }
    finally { setSaving(false); }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Clientes</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Gerencie todos os tenants do sistema</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')}><X size={16} /></button>
        </div>
      )}

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Buscar por nome ou slug..."
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-purple-500 outline-none"
        />
      </div>

      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-tertiary)] border-b border-[var(--border-color)]">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Tenant</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Plano</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Usuários</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Agentes</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Conversas</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Criado em</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {data?.tenants.map((t) => (
                <tr key={t.id} className="hover:bg-[var(--surface-tertiary)] transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--text-primary)]">{t.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{t.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${planColors[t.plan] || ''}`}>{t.plan}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{t._count.users}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{t._count.agents}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{t._count.conversations}</td>
                  <td className="px-4 py-3">
                    {t.isActive
                      ? <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle size={12} /> Ativo</span>
                      : <span className="flex items-center gap-1 text-xs text-red-600"><XCircle size={12} /> Inativo</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-tertiary)]">
                    {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => fetchTenantDetail(t.id)}
                      className="px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50 rounded-lg transition"
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
            <p className="text-xs text-[var(--text-tertiary)]">Página {page} de {data.totalPages} ({data.total} registros)</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-tertiary)] disabled:opacity-50 text-[var(--text-secondary)]">
                <ChevronLeft size={16} />
              </button>
              <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-tertiary)] disabled:opacity-50 text-[var(--text-secondary)]">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedTenant && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedTenant(null)}>
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">{selectedTenant.name}</h2>
                <button onClick={() => setSelectedTenant(null)} className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Nome</label>
                  <input type="text" value={editData?.name || ''} onChange={e => setEditData((d: any) => ({ ...d, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Plano</label>
                  <select value={editData?.plan || 'FREE'} onChange={e => setEditData((d: any) => ({ ...d, plan: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                    {planOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="isActive" checked={editData?.isActive || false}
                    onChange={e => setEditData((d: any) => ({ ...d, isActive: e.target.checked }))}
                    className="rounded border-[var(--border-color)] text-purple-600 focus:ring-purple-500" />
                  <label htmlFor="isActive" className="text-sm text-[var(--text-primary)]">Ativo</label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Max Agentes</label>
                  <input type="number" value={editData?.maxAgents || 1} onChange={e => setEditData((d: any) => ({ ...d, maxAgents: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Max Conversas</label>
                  <input type="number" value={editData?.maxConversations || 100} onChange={e => setEditData((d: any) => ({ ...d, maxConversations: parseInt(e.target.value) || 100 }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Max WhatsApp</label>
                  <input type="number" value={editData?.maxWhatsapp || 1} onChange={e => setEditData((d: any) => ({ ...d, maxWhatsapp: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Max AI Requests</label>
                  <input type="number" value={editData?.maxAiRequests || 500} onChange={e => setEditData((d: any) => ({ ...d, maxAiRequests: parseInt(e.target.value) || 500 }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                </div>
              </div>

              {/* Users list */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Usuários do Tenant</h3>
                <div className="space-y-2">
                  {selectedTenant.users?.map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--surface-secondary)]">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{u.name}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">{u.email}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{u.role}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-[var(--border-color)]">
                <button onClick={() => setSelectedTenant(null)}
                  className="px-4 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface-secondary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
