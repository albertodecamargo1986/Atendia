import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '../services/api';
import { Settings, Edit3, RefreshCw, Check, X, Loader2, DollarSign, Sliders } from 'lucide-react';
import { getErrorMessage } from '../lib/errors';

interface PlanConfig {
  id: string;
  planId: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  limits: {
    maxAgents: number;
    maxWhatsapp: number;
    maxConversations: number;
    maxAiRequests: number;
    maxTeamMembers: number;
  };
  isActive: boolean;
  updatedAt: string;
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingPlan, setEditingPlan] = useState<PlanConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncingPlanId, setSyncingPlanId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ planId: string; type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { loadPlans(); }, []);

  async function loadPlans() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/planos');
      setPlans(data);
    } catch {
      setError('Erro ao carregar planos');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!editingPlan) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/admin/planos/${editingPlan.planId}`, {
        name: editingPlan.name,
        price: editingPlan.price,
        description: editingPlan.description,
        features: editingPlan.features,
        limits: editingPlan.limits,
      });
      setPlans(prev => prev.map(p => p.planId === data.planId ? data : p));
      setEditingPlan(null);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao salvar plano'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncMp(planId: string) {
    setSyncingPlanId(planId);
    setSyncMessage(null);
    try {
      await api.post(`/admin/planos/${planId}/sync-mp`);
      toast.success('Salvo com sucesso!');
      setSyncMessage({ planId, type: 'success', text: 'Sincronizado com Mercado Pago!' });
    } catch (err: any) {
      setSyncMessage({ planId, type: 'error', text: getErrorMessage(err, 'Erro ao sincronizar') });
    } finally {
      setSyncingPlanId(null);
    }
  }

  function openEdit(plan: PlanConfig) {
    setEditingPlan({ ...plan });
    setError('');
  }

  function formatPrice(price: number) {
    return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Settings size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Planos</h1>
            <p className="text-sm text-[var(--text-secondary)]">Gerencie os planos, preços e limites do sistema</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[var(--color-error-bg)] border border-[var(--color-error-border)] text-[var(--color-error)] text-sm rounded-lg">{error}</div>
      )}

      {/* Tabela de Planos */}
      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-tertiary)] border-b border-[var(--border-color)]">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Plano</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Preço</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Agentes</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">WhatsApp</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Conversas</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">IA Requests</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)]">Mercado Pago</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--text-tertiary)]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {plans.map((plan) => (
                <tr key={plan.planId} className="hover:bg-[var(--surface-tertiary)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--text-primary)]">{plan.name}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">{plan.planId}</div>
                    {plan.description && (
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">{plan.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {plan.price === 0 ? 'Grátis' : formatPrice(plan.price)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {plan.limits.maxAgents === -1 ? '∞' : plan.limits.maxAgents}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {plan.limits.maxWhatsapp === -1 ? '∞' : plan.limits.maxWhatsapp}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {plan.limits.maxConversations === -1 ? '∞' : plan.limits.maxConversations.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {plan.limits.maxAiRequests === -1 ? '∞' : plan.limits.maxAiRequests.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    {plan.price > 0 ? (
                      <button
                        onClick={() => handleSyncMp(plan.planId)}
                        disabled={syncingPlanId === plan.planId}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition"
                        title="Sincronizar preço com Mercado Pago" aria-label="Sincronizar preço com Mercado Pago"
                      >
                        {syncingPlanId === plan.planId ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <RefreshCw size={12} />
                        )}
                        Sincronizar
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--text-tertiary)]">—</span>
                    )}
                    {syncMessage && syncMessage.planId === plan.planId && (
                      <div className={`text-xs mt-1 flex items-center gap-1 ${
                        syncMessage.type === 'success' ? 'text-green-600' : 'text-[var(--color-error)]'
                      }`}>
                        {syncMessage.type === 'success' ? <Check size={10} /> : <X size={10} />}
                        {syncMessage.text}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(plan)}
                      className="p-2 rounded-lg hover:bg-[var(--surface-tertiary)] text-[var(--text-secondary)] hover:text-purple-600 transition"
                      title="Editar plano" aria-label="Editar plano"
                    >
                      <Edit3 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Edição */}
      {editingPlan && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !saving && setEditingPlan(null)}>
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <DollarSign size={20} className="text-purple-600" />
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Editar {editingPlan.name}</h2>
              </div>
              <button onClick={() => setEditingPlan(null)} className="p-1 rounded-lg hover:bg-[var(--surface-tertiary)] text-[var(--text-secondary)]">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Nome do Plano</label>
                <input type="text" value={editingPlan.name}
                  onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Descrição</label>
                <input type="text" value={editingPlan.description}
                  onChange={e => setEditingPlan({ ...editingPlan, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
              </div>

              {/* Preço */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Preço (R$)</label>
                <input type="number" step="0.01" min="0" value={editingPlan.price}
                  onChange={e => setEditingPlan({ ...editingPlan, price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
              </div>

              {/* Limites */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sliders size={14} className="text-purple-600" />
                  <span className="text-sm font-medium text-[var(--text-primary)]">Limites</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Max Agentes</label>
                    <input type="number" min="-1" value={editingPlan.limits.maxAgents}
                      onChange={e => setEditingPlan({
                        ...editingPlan,
                        limits: { ...editingPlan.limits, maxAgents: parseInt(e.target.value) || 0 },
                      })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Max WhatsApp</label>
                    <input type="number" min="-1" value={editingPlan.limits.maxWhatsapp}
                      onChange={e => setEditingPlan({
                        ...editingPlan,
                        limits: { ...editingPlan.limits, maxWhatsapp: parseInt(e.target.value) || 0 },
                      })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Max Conversas</label>
                    <input type="number" min="-1" value={editingPlan.limits.maxConversations}
                      onChange={e => setEditingPlan({
                        ...editingPlan,
                        limits: { ...editingPlan.limits, maxConversations: parseInt(e.target.value) || 0 },
                      })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Max IA Requests</label>
                    <input type="number" min="-1" value={editingPlan.limits.maxAiRequests}
                      onChange={e => setEditingPlan({
                        ...editingPlan,
                        limits: { ...editingPlan.limits, maxAiRequests: parseInt(e.target.value) || 0 },
                      })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
                  </div>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">Use -1 para ilimitado</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditingPlan(null)} disabled={saving}
                className="flex-1 px-4 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface-secondary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition flex items-center justify-center gap-1">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mt-4 p-4 rounded-lg bg-[var(--color-info-bg)] border border-[var(--color-info-border)] text-sm text-blue-700">
        <strong>Como funciona:</strong> Altere os valores dos planos aqui. Para planos pagos, clique em
        "Sincronizar" para atualizar o preço no Mercado Pago. Clientes já assinantes mantêm o preço antigo;
        apenas novas assinaturas usarão o novo valor.
      </div>
    </div>
  );
}
