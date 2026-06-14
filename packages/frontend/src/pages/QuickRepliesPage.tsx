import { useState, useEffect } from 'react';
import api from '../services/api';
import { Zap, Plus, Trash2, Edit3, Save, X, Tag } from 'lucide-react';

interface QuickReply {
  id: string;
  shortcode: string;
  content: string;
  category: string | null;
}

export default function QuickRepliesPage() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ shortcode: '', content: '', category: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { fetchReplies(); }, []);

  async function fetchReplies() {
    try { const { data } = await api.get('/quick-replies'); setReplies(data); } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.patch(`/quick-replies/${editingId}`, form);
      } else {
        await api.post('/quick-replies', form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ shortcode: '', content: '', category: '' });
      fetchReplies();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta resposta rápida?')) return;
    try { await api.delete(`/quick-replies/${id}`); fetchReplies(); } catch { /* ignore */ }
  }

  function startEdit(r: QuickReply) {
    setEditingId(r.id);
    setForm({ shortcode: r.shortcode, content: r.content, category: r.category || '' });
    setShowForm(true);
  }

  const categories = [...new Set(replies.map(r => r.category).filter(Boolean))];
  const filtered = search
    ? replies.filter(r => r.shortcode.toLowerCase().includes(search.toLowerCase()) || r.content.toLowerCase().includes(search.toLowerCase()))
    : replies;

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Carregando...</p></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Respostas Rápidas</h1>
          <p className="text-sm text-gray-500 mt-1">Atalhos para mensagens frequentes. Digite /shortcode no chat para usar.</p>
        </div>
        <button onClick={() => { setEditingId(null); setForm({ shortcode: '', content: '', category: '' }); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition">
          <Plus size={18} /> Nova Resposta
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {/* Search */}
      <div className="mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por shortcode ou conteúdo..."
          className="w-full max-w-md px-4 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Editar Resposta' : 'Nova Resposta'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={20} /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shortcode *</label>
                  <div className="flex items-center">
                    <span className="text-gray-400 text-sm mr-1">/</span>
                    <input type="text" required value={form.shortcode} onChange={(e) => setForm(f => ({ ...f, shortcode: e.target.value.replace(/\s/g, '') }))}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="obrigado" />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Sem espaços. Ex: /obrigado</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Conteúdo *</label>
                  <textarea value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} rows={4} required
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Obrigado pelo contato! Em breve retornaremos..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                  <input type="text" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Ex: Saudação, Suporte, Vendas" />
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancelar</button>
                  <button type="submit" disabled={saving || !form.shortcode.trim() || !form.content.trim()}
                    className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                    {saving ? 'Salvando...' : (editingId ? 'Atualizar' : 'Criar')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Zap size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nenhuma resposta rápida</h3>
          <p className="text-gray-500 mt-1 mb-4">Crie atalhos para mensagens frequentes e agilize o atendimento</p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.length > 0 && !search && categories.map(cat => (
            <div key={cat}>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{cat}</h3>
              <div className="grid gap-3">
                {filtered.filter(r => r.category === cat).map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-sm text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">/{r.shortcode}</span>
                        <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{r.content}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button onClick={() => startEdit(r)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition" title="Editar"><Edit3 size={16} /></button>
                        <button onClick={() => handleDelete(r.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition" title="Remover"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {(!categories.length || search) && (
            <div className="grid gap-3">
              {filtered.map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-sm text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">/{r.shortcode}</span>
                      {r.category && <span className="ml-2 text-xs text-gray-400">{r.category}</span>}
                      <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{r.content}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button onClick={() => startEdit(r)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition" title="Editar"><Edit3 size={16} /></button>
                      <button onClick={() => handleDelete(r.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition" title="Remover"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
