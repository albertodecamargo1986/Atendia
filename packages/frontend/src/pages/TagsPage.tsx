import { useState, useEffect } from 'react';
import api from '../services/api';
import { Tag, Plus, Trash2, Edit3, X } from 'lucide-react';

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
    try { const { data } = await api.get('/tags'); setTags(data); } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.patch(`/tags/${editingId}`, form);
      } else {
        await api.post('/tags', form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: '', color: '#6366f1' });
      fetchTags();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta tag?')) return;
    try { await api.delete(`/tags/${id}`); fetchTags(); } catch { /* ignore */ }
  }

  function startEdit(t: TagData) {
    setEditingId(t.id);
    setForm({ name: t.name, color: t.color });
    setShowForm(true);
  }

  const presetColors = ['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Carregando...</p></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tags / Etiquetas</h1>
          <p className="text-sm text-gray-500 mt-1">Organize tickets com etiquetas coloridas</p>
        </div>
        <button onClick={() => { setEditingId(null); setForm({ name: '', color: '#6366f1' }); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition">
          <Plus size={18} /> Nova Tag
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Editar Tag' : 'Nova Tag'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={20} /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input type="text" required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Ex: Urgente, VIP, Bug" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
                  <div className="flex gap-2">
                    {presetColors.map(c => (
                      <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                        className={`w-8 h-8 rounded-full border-2 transition ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancelar</button>
                  <button type="submit" disabled={saving || !form.name.trim()}
                    className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
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
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Tag size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nenhuma tag criada</h3>
          <p className="text-gray-500 mt-1 mb-4">Crie tags para organizar e categorizar seus tickets</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tags.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                <div>
                  <p className="font-medium text-sm text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-400">{t._count?.tickets || 0} ticket{(t._count?.tickets || 0) !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => startEdit(t)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition" title="Editar"><Edit3 size={16} /></button>
                <button onClick={() => handleDelete(t.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition" title="Remover"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
