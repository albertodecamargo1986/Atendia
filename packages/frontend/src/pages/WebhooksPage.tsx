import { useState, useEffect } from 'react';
import api from '../services/api';
import { Webhook, Plus, Trash2, Edit3, X, Zap, CheckCircle, XCircle } from 'lucide-react';

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
    catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.patch(`/webhooks/${editingId}`, form);
      } else {
        await api.post('/webhooks', form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ url: '', events: [], secret: '' });
      fetchWebhooks();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este webhook?')) return;
    try { await api.delete(`/webhooks/${id}`); fetchWebhooks(); }
    catch { /* ignore */ }
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

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Carregando...</p></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-sm text-gray-500 mt-1">Integre com sistemas externos via webhooks</p>
        </div>
        <button onClick={() => { setEditingId(null); setForm({ url: '', events: [], secret: '' }); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition">
          <Plus size={18} /> Novo Webhook
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Editar Webhook' : 'Novo Webhook'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={20} /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
                  <input type="url" required value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="https://seu-sistema.com/webhook" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Eventos *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_EVENTS.map(ev => (
                      <label key={ev} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-gray-700 text-xs">{ev}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {!editingId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Secret (opcional)</label>
                    <input type="text" value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Gerado automaticamente se vazio" />
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancelar</button>
                  <button type="submit" disabled={saving || !form.url.trim() || form.events.length === 0}
                    className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                    {saving ? 'Salvando...' : (editingId ? 'Atualizar' : 'Criar')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {webhooks.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Webhook size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nenhum webhook</h3>
          <p className="text-gray-500 mt-1 mb-4">Crie webhooks para receber eventos em sistemas externos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map(w => (
            <div key={w.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-mono text-sm text-gray-900 truncate">{w.url}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${w.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {w.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {w.events.map(ev => (
                      <span key={ev} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs">{ev}</span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{w._count?.deliveries || 0} entregas</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <button onClick={() => handleTest(w.id)} disabled={testing === w.id}
                    className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition" title="Testar">
                    <Zap size={16} />
                  </button>
                  {testResult[w.id] !== undefined && (
                    testResult[w.id].success
                      ? <CheckCircle size={16} className="text-green-600" />
                      : <XCircle size={16} className="text-red-600" />
                  )}
                  <button onClick={() => startEdit(w)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition" title="Editar"><Edit3 size={16} /></button>
                  <button onClick={() => handleDelete(w.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition" title="Remover"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
