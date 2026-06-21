import { useState, useEffect } from 'react';
import api from '../services/api';
import { Tag, Plus, X, Save, Loader2, Trash2, CheckCircle, XCircle } from 'lucide-react';

const planOptions = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'];

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: '', discount: 10, plan: 'STARTER', maxUses: 1, expiresAt: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchCoupons(); }, []);

  async function fetchCoupons() {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/coupons');
      setCoupons(data);
    } catch { setError('Erro ao carregar cupons'); }
    finally { setLoading(false); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/coupons', form);
      setShowCreate(false);
      setForm({ code: '', discount: 10, plan: 'STARTER', maxUses: 1, expiresAt: '' });
      fetchCoupons();
    } catch { setError('Erro ao criar cupom'); }
    finally { setSaving(false); }
  }

  async function handleToggle(id: string) {
    try { await api.post(`/admin/coupons/${id}/toggle`); fetchCoupons(); }
    catch { setError('Erro ao alterar status'); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja deletar este cupom?')) return;
    try { await api.delete(`/admin/coupons/${id}`); fetchCoupons(); }
    catch { setError('Erro ao deletar'); }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Cupons de Desconto</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Gerencie cupons para descontos nos planos</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition">
          <Plus size={16} /> Novo Cupom
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')}><X size={16} /></button>
        </div>
      )}

      {showCreate && (
        <div className="mb-6 p-6 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Novo Cupom</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Código</label>
              <input type="text" required value={form.code} onChange={e => setForm({...form, code: e.target.value})}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="PROMO50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Desconto (%)</label>
              <input type="number" min={1} max={100} required value={form.discount} onChange={e => setForm({...form, discount: Number(e.target.value)})}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Plano</label>
              <select value={form.plan} onChange={e => setForm({...form, plan: e.target.value})}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-purple-500 outline-none">
                {planOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Usos máximos</label>
              <input type="number" min={1} value={form.maxUses} onChange={e => setForm({...form, maxUses: Number(e.target.value)})}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Expira em (opcional)</label>
              <input type="date" value={form.expiresAt} onChange={e => setForm({...form, expiresAt: e.target.value})}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">Cancelar</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--surface-tertiary)]">
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">Código</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">Desconto</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">Plano</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">Usos</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">Expira</th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-[var(--text-primary)]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-[var(--text-tertiary)]">Carregando...</td></tr>
              ) : coupons.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-[var(--text-tertiary)]">Nenhum cupom encontrado</td></tr>
              ) : coupons.map(coupon => (
                <tr key={coupon.id} className="border-b border-[var(--border-color)] hover:bg-[var(--surface-tertiary)] transition">
                  <td className="px-4 py-3 font-mono font-bold text-[var(--text-primary)]">{coupon.code}</td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">{coupon.discount}%</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">{coupon.plan}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{coupon.usedCount}/{coupon.maxUses}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${coupon.isActive ? 'text-green-600' : 'text-red-600'}`}>
                      {coupon.isActive ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      {coupon.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleToggle(coupon.id)} title={coupon.isActive ? 'Desativar' : 'Ativar'}
                        className={`p-1.5 rounded-lg transition ${coupon.isActive ? 'text-orange-500 hover:bg-orange-50' : 'text-green-500 hover:bg-green-50'}`}>
                        {coupon.isActive ? <XCircle size={16} /> : <CheckCircle size={16} />}
                      </button>
                      <button onClick={() => handleDelete(coupon.id)} title="Deletar"
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
