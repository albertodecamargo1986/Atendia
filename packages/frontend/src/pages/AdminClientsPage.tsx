import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '../services/api';
import {
  Search, ChevronLeft, ChevronRight, CheckCircle, XCircle,
  X, Save, Loader2, UserPlus, Trash2, Key, Clock,
  CreditCard, AlertTriangle, DollarSign,
} from 'lucide-react';
import { getErrorMessage } from '../lib/errors';
import { askConfirm } from '../components/ui/ConfirmDialog';

interface TenantData {
  id: string; name: string; slug: string; plan: string; isActive: boolean;
  maxAgents: number; maxConversations: number; maxWhatsapp: number; maxAiRequests: number;
  createdAt: string; updatedAt: string;
  _count: { users: number; agents: number; conversations: number };
  subscription: { status: string; currentPeriodEnd: string } | null;
}

interface TenantListResponse {
  tenants: TenantData[]; total: number; page: number; limit: number; totalPages: number;
}

const planOptions = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'];
const planColors: Record<string, string> = {
  FREE: 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]', STARTER: 'bg-blue-100 text-blue-700',
  PRO: 'bg-purple-100 text-purple-700', ENTERPRISE: 'bg-yellow-100 text-yellow-700',
};

export default function AdminClientsPage() {
  const [data, setData] = useState<TenantListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [editData, setEditData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'OPERATOR' });
  const [savingUser, setSavingUser] = useState(false);
  const [resetPwId, setResetPwId] = useState<string | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [savingReset, setSavingReset] = useState(false);
  const [extendDays, setExtendDays] = useState(30);
  const [extending, setExtending] = useState(false);
  const [showConfirmPayment, setShowConfirmPayment] = useState(false);
  const [confirmMonths, setConfirmMonths] = useState(1);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  useEffect(() => { fetchTenants(); }, [page, search]);

  async function fetchTenants() {
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (search) params.set('search', search);
      const { data: res } = await api.get(`/admin/tenants?${params}`);
      setData(res);
    } catch (err) { toast.error(getErrorMessage(err, 'Erro ao carregar tenants')); }
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
      const { data: users } = await api.get(`/admin/tenants/${id}/users`);
      setUsersList(users);
    } catch (err) { toast.error(getErrorMessage(err, 'Erro ao carregar detalhes')); }
  }

  async function handleSave() {
    if (!selectedTenant) return;
    setSaving(true);
    try {
      await api.patch(`/admin/tenants/${selectedTenant.id}`, editData);
      toast.success('Alterações salvas!');
      fetchTenantDetail(selectedTenant.id);
      fetchTenants();
    } catch (err) { toast.error(getErrorMessage(err, 'Erro ao salvar')); }
    finally { setSaving(false); }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTenant) return;
    setSavingUser(true);
    try {
      await api.post(`/admin/tenants/${selectedTenant.id}/users`, userForm);
      toast.success('Salvo com sucesso!');
      setShowCreateUser(false);
      setUserForm({ name: '', email: '', password: '', role: 'OPERATOR' });
      fetchTenantDetail(selectedTenant.id);
    } catch (err) { toast.error(getErrorMessage(err, 'Erro ao criar usuário')); }
    finally { setSavingUser(false); }
  }

  async function handleDeleteUser(userId: string) {
    if (!(await askConfirm({ title: 'Tem certeza que deseja excluir este usuário?', confirmLabel: 'Confirmar', danger: true }))) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      toast.success('Removido com sucesso.');
      fetchTenantDetail(selectedTenant!.id);
    } catch (err: any) { toast.error(getErrorMessage(err, 'Erro ao deletar')); }
  }

  async function handleResetPassword(userId: string) {
    if (!resetPwValue || resetPwValue.length < 6) return;
    setSavingReset(true);
    try {
      await api.post(`/admin/users/${userId}/reset-password`, { password: resetPwValue });
      toast.success('Salvo com sucesso!');
      setResetPwId(null);
      setResetPwValue('');
    } catch (err) { toast.error(getErrorMessage(err, 'Erro ao redefinir senha')); }
    finally { setSavingReset(false); }
  }

  async function handleConfirmPayment() {
    if (!selectedTenant) return;
    setConfirmingPayment(true);
    try {
      await api.post(`/admin/tenants/${selectedTenant.id}/confirm-payment`, { months: confirmMonths });
      toast.success('Salvo com sucesso!');
      setShowConfirmPayment(false);
      setConfirmMonths(1);
      fetchTenantDetail(selectedTenant.id);
      fetchTenants();
    } catch (err: any) { toast.error(getErrorMessage(err, 'Erro ao confirmar pagamento')); }
    finally { setConfirmingPayment(false); }
  }

  async function handleExtendTrial() {
    if (!selectedTenant) return;
    setExtending(true);
    try {
      await api.post(`/admin/tenants/${selectedTenant.id}/extend-trial`, { days: extendDays });
      toast.success('Salvo com sucesso!');
      fetchTenantDetail(selectedTenant.id);
    } catch (err) { toast.error(getErrorMessage(err, 'Erro ao estender trial')); }
    finally { setExtending(false); }
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
        <div className="mb-4 p-3 bg-[var(--color-error-bg)] border border-[var(--color-error-border)] text-[var(--color-error)] text-sm rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Fechar"><X size={16} /></button>
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
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Plano</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Usuários</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Agentes</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Conversas</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Assinatura</th>
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
                    {t.subscription?.status === 'PAST_DUE' ? (
                      <span className="flex items-center gap-1 text-xs text-[var(--color-error)]"><AlertTriangle size={12} /> Inadimplente</span>
                    ) : t.subscription?.status === 'ACTIVE' ? (
                      <span className="flex items-center gap-1 text-xs text-[var(--color-success)]"><CheckCircle size={12} /> Ativa</span>
                    ) : t.subscription?.status === 'TRIALING' ? (
                      <span className="flex items-center gap-1 text-xs text-blue-600"><Clock size={12} /> Trial</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.isActive
                      ? <span className="flex items-center gap-1 text-xs text-[var(--color-success)]"><CheckCircle size={12} /> Ativo</span>
                      : <span className="flex items-center gap-1 text-xs text-[var(--color-error)]"><XCircle size={12} /> Inativo</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-tertiary)]">
                    {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => fetchTenantDetail(t.id)}
                      className="px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50 rounded-lg transition">
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

      {/* Confirm Payment Modal */}
      {showConfirmPayment && selectedTenant && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirmPayment(false)}>
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Confirmar Pagamento</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Confirmar pagamento para <strong>{selectedTenant.name}</strong>.
                {selectedTenant.subscription?.status === 'PAST_DUE' && (
                  <span className="text-[var(--color-error)] block mt-1">Este tenant está inadimplente e será reativado.</span>
                )}
              </p>
              <div className="mb-4">
                <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Período (meses)</label>
                <select value={confirmMonths} onChange={e => setConfirmMonths(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                  <option value={1}>1 mês</option>
                  <option value={3}>3 meses</option>
                  <option value={6}>6 meses</option>
                  <option value={12}>12 meses</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowConfirmPayment(false)}
                  className="px-4 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface-secondary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">
                  Cancelar
                </button>
                <button onClick={handleConfirmPayment} disabled={confirmingPayment}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
                  {confirmingPayment ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
                  {confirmingPayment ? 'Confirmando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedTenant && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedTenant(null)}>
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">{selectedTenant.name}</h2>
                <button onClick={() => setSelectedTenant(null)} className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]">
                  <X size={20} />
                </button>
              </div>

              {/* Config */}
              <div className="grid grid-cols-2 gap-4 mb-4">
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

              {/* Subscription Status */}
              <div className={`mb-6 p-4 rounded-lg border ${
                selectedTenant.subscription?.status === 'PAST_DUE'
                  ? 'bg-[var(--color-error-bg)] border-[var(--color-error-border)]'
                  : selectedTenant.subscription?.status === 'ACTIVE'
                  ? 'bg-[var(--color-success-bg)] border-[var(--color-success-border)]'
                  : 'bg-[var(--surface-secondary)] border-[var(--border-color)]'
              }`}>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                  <CreditCard size={16} /> Assinatura
                </h3>
                {selectedTenant.subscription ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Status:</span>
                      {selectedTenant.subscription.status === 'ACTIVE' ? (
                        <span className="flex items-center gap-1 text-xs text-[var(--color-success)] font-medium"><CheckCircle size={12} /> Ativa</span>
                      ) : selectedTenant.subscription.status === 'PAST_DUE' ? (
                        <span className="flex items-center gap-1 text-xs text-[var(--color-error)] font-medium"><AlertTriangle size={12} /> Inadimplente</span>
                      ) : (
                        <span className="text-xs text-[var(--text-secondary)]">{selectedTenant.subscription.status}</span>
                      )}
                    </div>
                    {selectedTenant.subscription.currentPeriodEnd && (
                      <p className="text-xs text-[var(--text-secondary)]">
                        Vigente até: {new Date(selectedTenant.subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}
                        {new Date(selectedTenant.subscription.currentPeriodEnd) < new Date() && (
                          <span className="text-[var(--color-error)] ml-1">(vencida)</span>
                        )}
                      </p>
                    )}
                    <button onClick={() => { setConfirmMonths(1); setShowConfirmPayment(true); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition mt-1">
                      <DollarSign size={12} /> Confirmar Pagamento
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)] mb-2">Nenhuma assinatura registrada</p>
                    <button onClick={() => { setConfirmMonths(1); setShowConfirmPayment(true); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition">
                      <DollarSign size={12} /> Ativar Assinatura
                    </button>
                  </div>
                )}
              </div>

              {/* Trial Extension */}
              <div className="mb-6 p-4 rounded-lg bg-[var(--color-info-bg)] border border-[var(--color-info-border)]">
                <h3 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                  <Clock size={16} /> Período de Trial
                </h3>
                <p className="text-xs text-blue-600 mb-2">
                  {selectedTenant.trialEndAt
                    ? `Trial atual expira em: ${new Date(selectedTenant.trialEndAt).toLocaleDateString('pt-BR')}`
                    : 'Este tenant não possui trial ativo'}
                </p>
                <div className="flex items-center gap-2">
                  <input type="number" value={extendDays} onChange={e => setExtendDays(Number(e.target.value))} min={1} max={365}
                    className="w-20 px-3 py-1.5 text-sm rounded-lg border border-blue-300 bg-[var(--surface-primary)] focus:ring-2 focus:ring-blue-500 outline-none" />
                  <span className="text-sm text-blue-700">dias</span>
                  <button onClick={handleExtendTrial} disabled={extending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                    {extending ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                    Estender Trial
                  </button>
                </div>
              </div>

              {/* Users Management */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Usuários da empresa</h3>
                  <button onClick={() => setShowCreateUser(!showCreateUser)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50 rounded-lg transition">
                    <UserPlus size={14} /> Novo Usuário
                  </button>
                </div>

                {showCreateUser && (
                  <form onSubmit={handleCreateUser} className="mb-3 p-4 rounded-lg bg-[var(--surface-secondary)] space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" placeholder="Nome" required value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})}
                        className="px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
                      <input type="email" placeholder="Email" required value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})}
                        className="px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
                      <input type="password" placeholder="Senha" required minLength={8} value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})}
                        className="px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
                      <select value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})}
                        className="px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none">
                        <option value="ADMIN">Admin</option>
                        <option value="SUPERVISOR">Supervisor</option>
                        <option value="OPERATOR">Operador</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setShowCreateUser(false)}
                        className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancelar</button>
                      <button type="submit" disabled={savingUser}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition">
                        {savingUser ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                        Criar
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-2">
                  {usersList.map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--surface-secondary)]">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{u.name}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{u.role}</span>
                        {resetPwId === u.id ? (
                          <div className="flex items-center gap-1">
                            <input type="password" placeholder="Nova senha" value={resetPwValue} minLength={8}
                              onChange={e => setResetPwValue(e.target.value)}
                              className="w-28 px-2 py-1 text-xs rounded border border-[var(--border-color)] focus:ring-2 focus:ring-purple-500 outline-none" />
                            <button onClick={() => handleResetPassword(u.id)} disabled={savingReset || resetPwValue.length < 6}
                              className="p-1 text-green-600 hover:bg-[var(--color-success-bg)] rounded">
                              {savingReset ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                            </button>
                            <button onClick={() => { setResetPwId(null); setResetPwValue(''); }}
                              aria-label="Remover" className="p-1 text-[var(--color-error)] hover:bg-[var(--color-error-bg)] rounded"><X size={14} /></button>
                          </div>
                        ) : (
                          <button onClick={() => setResetPwId(u.id)} title="Redefinir senha" aria-label="Redefinir senha"
                            className="p-1.5 text-blue-600 hover:bg-[var(--color-info-bg)] rounded-lg transition">
                            <Key size={14} />
                          </button>
                        )}
                        {u.role !== 'OWNER' && (
                          <button onClick={() => handleDeleteUser(u.id)} title="Deletar usuário" aria-label="Deletar usuário"
                            className="p-1.5 text-[var(--color-error)] hover:bg-[var(--color-error-bg)] rounded-lg transition">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-[var(--border-color)]">
                <button onClick={() => setSelectedTenant(null)}
                  className="px-4 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface-secondary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">
                  Fechar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
