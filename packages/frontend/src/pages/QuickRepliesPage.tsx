import { useState, useEffect } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { toast } from 'sonner';
import api from '../services/api';
import { Zap, Plus, Trash2, Edit3, X } from 'lucide-react';
import { getErrorMessage } from '../lib/errors';
import { askConfirm } from '../components/ui/ConfirmDialog';

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
    try { const { data } = await api.get('/quick-replies'); setReplies(data); } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.patch(`/quick-replies/${editingId}`, form);
        toast.success('Alterações salvas!');
      } else {
        await api.post('/quick-replies', form);
        toast.success('Salvo com sucesso!');
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ shortcode: '', content: '', category: '' });
      fetchReplies();
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao salvar'));
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!(await askConfirm({ title: 'Remover esta resposta rápida?', confirmLabel: 'Confirmar', danger: true }))) return;
    try { await api.delete(`/quick-replies/${id}`); toast.success('Removido com sucesso.'); fetchReplies(); } catch (err) { toast.error(getErrorMessage(err)); }
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

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-[var(--text-secondary)]">Carregando...</p></div>;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Respostas rápidas"
        description="Mensagens prontas. No chat, digite / e o atalho para usar."
        actions={
          <button onClick={() => { setEditingId(null); setForm({ shortcode: '', content: '', category: '' }); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition">
            <Plus size={18} /> Nova resposta
          </button>
        }
      />

      {error && <div className="bg-[var(--color-error-bg)] border border-[var(--color-error-border)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {/* Search */}
      <div className="mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por shortcode ou conteúdo..."
          className="w-full max-w-md px-4 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{editingId ? 'Editar Resposta' : 'Nova Resposta'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]" aria-label="Fechar"><X size={20} /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Shortcode *</label>
                  <div className="flex items-center">
                    <span className="text-[var(--text-tertiary)] text-sm mr-1">/</span>
                    <input type="text" required value={form.shortcode} onChange={(e) => setForm(f => ({ ...f, shortcode: e.target.value.replace(/\s/g, '') }))}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                      placeholder="obrigado" />
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">Sem espaços. Ex: /obrigado</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Conteúdo *</label>
                  <textarea value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} rows={4} required
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                    placeholder="Obrigado pelo contato! Em breve retornaremos..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Categoria</label>
                  <input type="text" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                    placeholder="Ex: Saudação, Suporte, Vendas" />
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-[var(--text-primary)] bg-[var(--surface-tertiary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">Cancelar</button>
                  <button type="submit" disabled={saving || !form.shortcode.trim() || !form.content.trim()}
                    className="px-4 py-2.5 bg-[var(--color-primary-500)] text-white text-sm font-medium rounded-lg hover:bg-[var(--color-primary-600)] disabled:opacity-50 transition">
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
        <div className="text-center py-16 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)]">
          <Zap size={48} className="mx-auto text-[var(--text-tertiary)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)]">Nenhuma resposta rápida</h3>
          <p className="text-[var(--text-secondary)] mt-1 mb-4">Crie atalhos para mensagens frequentes e agilize o atendimento</p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.length > 0 && !search && categories.map(cat => (
            <div key={cat}>
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">{cat}</h3>
              <div className="grid gap-3">
                {filtered.filter(r => r.category === cat).map(r => (
                  <div key={r.id} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-sm text-[var(--color-primary-500)] bg-[var(--color-primary-50)] px-2 py-0.5 rounded">/{r.shortcode}</span>
                        <p className="text-sm text-[var(--text-primary)] mt-2 whitespace-pre-wrap">{r.content}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button onClick={() => startEdit(r)} className="p-2 rounded-lg hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] transition" title="Editar" aria-label="Editar"><Edit3 size={16} /></button>
                        <button onClick={() => handleDelete(r.id)} className="p-2 rounded-lg hover:bg-[var(--color-error-bg)] text-red-400 transition" title="Remover" aria-label="Remover"><Trash2 size={16} /></button>
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
                <div key={r.id} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-sm text-[var(--color-primary-500)] bg-[var(--color-primary-50)] px-2 py-0.5 rounded">/{r.shortcode}</span>
                      {r.category && <span className="ml-2 text-xs text-[var(--text-tertiary)]">{r.category}</span>}
                      <p className="text-sm text-[var(--text-primary)] mt-2 whitespace-pre-wrap">{r.content}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button onClick={() => startEdit(r)} className="p-2 rounded-lg hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] transition" title="Editar" aria-label="Editar"><Edit3 size={16} /></button>
                      <button onClick={() => handleDelete(r.id)} className="p-2 rounded-lg hover:bg-[var(--color-error-bg)] text-red-400 transition" title="Remover" aria-label="Remover"><Trash2 size={16} /></button>
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
