import { useState, useEffect } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { toast } from 'sonner';
import api from '../services/api';
import { Tag, Plus, Trash2, Edit3, X } from 'lucide-react';
import { getErrorMessage } from '../lib/errors';
import { askConfirm } from '../components/ui/ConfirmDialog';

interface TagData {
  id: string;
  name: string;
  color: string;
  _count?: { tickets: number };
}

export default function TagsPage() {
  const [tags, setTags] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', color: '#6366f1' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchTags(); }, []);

  async function fetchTags() {
    try { const { data } = await api.get('/tags'); setTags(data); } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.patch(`/tags/${editingId}`, form);
        toast.success('Alterações salvas!');
      } else {
        await api.post('/tags', form);
        toast.success('Salvo com sucesso!');
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: '', color: '#6366f1' });
      fetchTags();
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao salvar'));
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!(await askConfirm({ title: 'Remover esta etiqueta?', confirmLabel: 'Confirmar', danger: true }))) return;
    try { await api.delete(`/tags/${id}`); toast.success('Removido com sucesso.'); fetchTags(); } catch (err) { toast.error(getErrorMessage(err)); }
  }

  function startEdit(t: TagData) {
    setEditingId(t.id);
    setForm({ name: t.name, color: t.color });
    setShowForm(true);
  }

  const presetColors = ['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-[var(--text-secondary)]">Carregando...</p></div>;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Etiquetas"
        description="Organize os atendimentos com etiquetas coloridas"
        actions={
          <button onClick={() => { setEditingId(null); setForm({ name: '', color: '#6366f1' }); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition">
            <Plus size={18} /> Nova etiqueta
          </button>
        }
      />

      {error && <div className="bg-[var(--color-error-bg)] border border-[var(--color-error-border)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{editingId ? 'Editar etiqueta' : 'Nova etiqueta'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]" aria-label="Fechar"><X size={20} /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Nome *</label>
                  <input type="text" required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                    placeholder="Ex: Urgente, VIP, Bug" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Cor</label>
                  <div className="flex gap-2">
                    {presetColors.map(c => (
                      <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                        className={`w-8 h-8 rounded-full border-2 transition ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-[var(--text-primary)] bg-[var(--surface-tertiary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">Cancelar</button>
                  <button type="submit" disabled={saving || !form.name.trim()}
                    className="px-4 py-2.5 bg-[var(--color-primary-500)] text-white text-sm font-medium rounded-lg hover:bg-[var(--color-primary-600)] disabled:opacity-50 transition">
                    {saving ? 'Salvando...' : (editingId ? 'Atualizar' : 'Criar')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Tag List */}
      {tags.length === 0 ? (
        <div className="text-center py-16 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)]">
          <Tag size={48} className="mx-auto text-[var(--text-tertiary)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)]">Nenhuma etiqueta criada</h3>
          <p className="text-[var(--text-secondary)] mt-1 mb-4">Crie etiquetas para organizar seus atendimentos</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tags.map(t => (
            <div key={t.id} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                <div>
                  <p className="font-medium text-sm text-[var(--text-primary)]">{t.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{t._count?.tickets || 0} atendimento{(t._count?.tickets || 0) !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => startEdit(t)} className="p-2 rounded-lg hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] transition" title="Editar" aria-label="Editar"><Edit3 size={16} /></button>
                <button onClick={() => handleDelete(t.id)} className="p-2 rounded-lg hover:bg-[var(--color-error-bg)] text-red-400 transition" title="Remover" aria-label="Remover"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
