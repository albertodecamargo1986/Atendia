import { useState, useEffect } from 'react';
import api from '../services/api';
import { Megaphone, Plus, Play, XCircle, Trash2, X, Send } from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  message: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt?: string;
  createdAt: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [form, setForm] = useState({ name: '', message: '', scheduledAt: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchCampaigns(); }, []);

  async function fetchCampaigns() {
    try { const { data } = await api.get('/campaigns'); setCampaigns(data.data || data); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function openForm() {
    setShowForm(true);
    if (contacts.length === 0) {
      try {
        const { data } = await api.get('/contacts');
        setContacts(data.contacts || data || []);
      } catch { /* ignore */ }
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/campaigns', {
        ...form,
        contactIds: selectedContacts,
        scheduledAt: form.scheduledAt || undefined,
      });
      setShowForm(false);
      setForm({ name: '', message: '', scheduledAt: '' });
      setSelectedContacts([]);
      fetchCampaigns();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar campanha');
    } finally { setSaving(false); }
  }

  async function handleStart(id: string) {
    try { await api.post(`/campaigns/${id}/start`); fetchCampaigns(); }
    catch { /* ignore */ }
  }

  async function handleCancel(id: string) {
    try { await api.post(`/campaigns/${id}/cancel`); fetchCampaigns(); }
    catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deletar esta campanha?')) return;
    try { await api.delete(`/campaigns/${id}`); fetchCampaigns(); }
    catch { /* ignore */ }
  }

  function toggleContact(id: string) {
    setSelectedContacts(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  const statusColors: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    SCHEDULED: 'bg-blue-100 text-blue-700',
    RUNNING: 'bg-yellow-100 text-yellow-700',
    COMPLETED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };

  const statusLabels: Record<string, string> = {
    DRAFT: 'Rascunho',
    SCHEDULED: 'Agendada',
    RUNNING: 'Enviando',
    COMPLETED: 'Concluída',
    CANCELLED: 'Cancelada',
  };

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Carregando...</p></div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campanhas</h1>
          <p className="text-sm text-gray-500 mt-1">Envie mensagens em massa para seus contatos</p>
        </div>
        <button onClick={openForm}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition">
          <Plus size={18} /> Nova Campanha
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Nova Campanha</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={20} /></button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem *</label>
                  <textarea required rows={3} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agendar para (opcional)</label>
                  <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contatos ({selectedContacts.length} selecionado{selectedContacts.length !== 1 ? 's' : ''})</label>
                  <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                    {contacts.map(c => (
                      <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                        <input type="checkbox" checked={selectedContacts.includes(c.id)} onChange={() => toggleContact(c.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-gray-900">{c.name}</span>
                        <span className="text-gray-400 text-xs">{c.phone}</span>
                      </label>
                    ))}
                    {contacts.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Nenhum contato encontrado</p>}
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancelar</button>
                  <button type="submit" disabled={saving || !form.name.trim() || !form.message.trim() || selectedContacts.length === 0}
                    className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                    {saving ? 'Criando...' : 'Criar Campanha'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Megaphone size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nenhuma campanha</h3>
          <p className="text-gray-500 mt-1 mb-4">Crie campanhas para enviar mensagens em massa</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{c.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[c.status] || 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[c.status] || c.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{c.message}</p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    <span>{c.totalRecipients} destinatários</span>
                    <span className="text-green-600">{c.sentCount} enviados</span>
                    {c.failedCount > 0 && <span className="text-red-600">{c.failedCount} falhas</span>}
                    {c.scheduledAt && <span>Agendado: {new Date(c.scheduledAt).toLocaleString('pt-BR')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.status === 'DRAFT' && (
                    <button onClick={() => handleStart(c.id)} className="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition" title="Iniciar"><Play size={16} /></button>
                  )}
                  {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
                    <button onClick={() => handleCancel(c.id)} className="p-2 rounded-lg bg-yellow-50 text-yellow-600 hover:bg-yellow-100 transition" title="Cancelar"><XCircle size={16} /></button>
                  )}
                  {c.status !== 'RUNNING' && (
                    <button onClick={() => handleDelete(c.id)} className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition" title="Deletar"><Trash2 size={16} /></button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
