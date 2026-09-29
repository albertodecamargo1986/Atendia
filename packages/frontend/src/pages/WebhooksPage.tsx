import { useState, useEffect } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { toast } from 'sonner';
import api from '../services/api';
import { Webhook, Plus, Trash2, Edit3, X, Zap, CheckCircle, XCircle } from 'lucide-react';
import { getErrorMessage } from '../lib/errors';
import { askConfirm } from '../components/ui/ConfirmDialog';

interface WebhookData {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  _count?: { deliveries: number };
}

const AVAILABLE_EVENTS = [
  'ticket.created', 'ticket.closed', 'ticket.assigned',
  'message.received', 'message.sent',
  'conversation.created', 'conversation.resolved', 'conversation.human_takeover',
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ url: '', events: [] as string[], secret: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, any>>({});

  useEffect(() => { fetchWebhooks(); }, []);

  async function fetchWebhooks() {
    try { const { data } = await api.get('/webhooks'); setWebhooks(data); }
    catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.patch(`/webhooks/${editingId}`, form);
        toast.success('Alterações salvas!');
      } else {
        await api.post('/webhooks', form);
        toast.success('Salvo com sucesso!');
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ url: '', events: [], secret: '' });
      fetchWebhooks();
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao salvar'));
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!(await askConfirm({ title: 'Remover esta integração?', confirmLabel: 'Confirmar', danger: true }))) return;
    try { await api.delete(`/webhooks/${id}`); toast.success('Removido com sucesso.'); fetchWebhooks(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  }

  async function handleTest(id: string) {
    setTesting(id);
    try {
      const { data } = await api.post(`/webhooks/${id}/test`);
      setTestResult(prev => ({ ...prev, [id]: data }));
    } catch { setTestResult(prev => ({ ...prev, [id]: { success: false } })); }
    finally { setTesting(null); }
  }

  function toggleEvent(event: string) {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }));
  }

  function startEdit(w: WebhookData) {
    setEditingId(w.id);
    setForm({ url: w.url, events: w.events, secret: '' });
    setShowForm(true);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-[var(--text-secondary)]">Carregando...</p></div>;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Integrações (webhooks)"
        description="Avise outros sistemas (CRM, planilhas, automações) quando algo acontece no AtendIA"
        actions={
          <button onClick={() => { setEditingId(null); setForm({ url: '', events: [], secret: '' }); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition">
            <Plus size={18} /> Nova integração
          </button>
        }
      />

      {error && <div className="bg-[var(--color-error-bg)] border border-[var(--color-error-border)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{editingId ? 'Editar integração' : 'Nova integração'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]" aria-label="Fechar"><X size={20} /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">URL *</label>
                  <input type="url" required value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                    placeholder="https://seu-sistema.com/webhook" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Eventos *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_EVENTS.map(ev => (
                      <label key={ev} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)}
                          className="rounded border-[var(--border-color)] text-[var(--color-primary-500)] focus:ring-[var(--color-primary-500)]" />
                        <span className="text-[var(--text-primary)] text-xs">{ev}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {!editingId && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Secret (opcional)</label>
                    <input type="text" value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                      placeholder="Gerado automaticamente se vazio" />
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-[var(--text-primary)] bg-[var(--surface-tertiary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">Cancelar</button>
                  <button type="submit" disabled={saving || !form.url.trim() || form.events.length === 0}
                    className="px-4 py-2.5 bg-[var(--color-primary-500)] text-white text-sm font-medium rounded-lg hover:bg-[var(--color-primary-600)] disabled:opacity-50 transition">
                    {saving ? 'Salvando...' : (editingId ? 'Atualizar' : 'Criar')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {webhooks.length === 0 ? (
        <div className="text-center py-16 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)]">
          <Webhook size={48} className="mx-auto text-[var(--text-tertiary)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)]">Nenhum webhook</h3>
          <p className="text-[var(--text-secondary)] mt-1 mb-4">Crie webhooks para receber eventos em sistemas externos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map(w => (
            <div key={w.id} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-mono text-sm text-[var(--text-primary)] truncate">{w.url}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${w.isActive ? 'bg-green-100 text-[var(--color-success)]' : 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]'}`}>
                      {w.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {w.events.map(ev => (
                      <span key={ev} className="px-2 py-0.5 bg-[var(--color-primary-50)] text-[var(--color-primary-500)] rounded text-xs">{ev}</span>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">{w._count?.deliveries || 0} entregas</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <button onClick={() => handleTest(w.id)} disabled={testing === w.id}
                    className="p-2 rounded-lg bg-[var(--color-info-bg)] text-blue-600 hover:bg-blue-100 transition" title="Testar" aria-label="Testar">
                    <Zap size={16} />
                  </button>
                  {testResult[w.id] !== undefined && (
                    testResult[w.id].success
                      ? <CheckCircle size={16} className="text-green-600" />
                      : <XCircle size={16} className="text-[var(--color-error)]" />
                  )}
                  <button onClick={() => startEdit(w)} className="p-2 rounded-lg hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] transition" title="Editar" aria-label="Editar"><Edit3 size={16} /></button>
                  <button onClick={() => handleDelete(w.id)} className="p-2 rounded-lg hover:bg-[var(--color-error-bg)] text-red-400 transition" title="Remover" aria-label="Remover"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
