import { useState, useEffect } from 'react';
import api from '../services/api';
import { Layers, Plus, Trash2, Edit3, Save, X, Users, Smartphone, UserPlus, Unplug } from 'lucide-react';

interface QueueData {
  id: string;
  name: string;
  color: string;
  greetingMessage: string | null;
  ticketCount: number;
  users: { id: string; name: string; email: string }[];
  whatsapps: { id: string; phoneNumber: string; status: string }[];
}

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface WASession {
  id: string;
  phoneNumber: string;
  status: string;
}

export default function QueuesPage() {
  const [queues, setQueues] = useState<QueueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', color: '#6366f1', greetingMessage: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Assign modals
  const [showUserAssign, setShowUserAssign] = useState<string | null>(null);
  const [showWaAssign, setShowWaAssign] = useState<string | null>(null);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [waSessions, setWaSessions] = useState<WASession[]>([]);

  useEffect(() => { fetchQueues(); }, []);

  async function fetchQueues() {
    try {
      const { data } = await api.get('/queues');
      setQueues(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.patch(`/queues/${editingId}`, form);
      } else {
        await api.post('/queues', form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: '', color: '#6366f1', greetingMessage: '' });
      fetchQueues();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta fila?')) return;
    try {
      await api.delete(`/queues/${id}`);
      fetchQueues();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao remover');
    }
  }

  function startEdit(q: QueueData) {
    setEditingId(q.id);
    setForm({ name: q.name, color: q.color, greetingMessage: q.greetingMessage || '' });
    setShowForm(true);
  }

  async function openUserAssign(queueId: string) {
    try {
      const { data } = await api.get('/users');
      setTeamUsers(data.filter((u: TeamUser) => u.isActive));
      setShowUserAssign(queueId);
    } catch { /* ignore */ }
  }

  async function openWaAssign(queueId: string) {
    try {
      const { data } = await api.get('/whatsapp');
      setWaSessions(data);
      setShowWaAssign(queueId);
    } catch { /* ignore */ }
  }

  async function toggleUserInQueue(queueId: string, userId: string, isInQueue: boolean) {
    try {
      if (isInQueue) {
        await api.delete(`/queues/${queueId}/users/${userId}`);
      } else {
        await api.post(`/queues/${queueId}/users/${userId}`);
      }
      fetchQueues();
    } catch { /* ignore */ }
  }

  async function toggleWaInQueue(queueId: string, sessionId: string, isInQueue: boolean) {
    try {
      if (isInQueue) {
        await api.delete(`/queues/${queueId}/whatsapp/${sessionId}`);
      } else {
        await api.post(`/queues/${queueId}/whatsapp/${sessionId}`);
      }
      fetchQueues();
    } catch { /* ignore */ }
  }

  const presetColors = ['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Carregando filas...</p></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Filas de Atendimento</h1>
          <p className="text-sm text-gray-500 mt-1">Organize o fluxo de atendimento por departamento ou time</p>
        </div>
        <button onClick={() => { setEditingId(null); setForm({ name: '', color: '#6366f1', greetingMessage: '' }); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition">
          <Plus size={18} /> Nova Fila
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Editar Fila' : 'Nova Fila'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={20} /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input type="text" required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Ex: Suporte, Vendas, Financeiro" />
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem de saudação</label>
                  <textarea value={form.greetingMessage} onChange={(e) => setForm(f => ({ ...f, greetingMessage: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Olá! Em que podemos ajudar?" />
                  <p className="text-xs text-gray-400 mt-1">Enviada automaticamente quando um ticket entra na fila</p>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowForm(false)}
                    className="px-4 py-2.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancelar</button>
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

      {/* Queue List */}
      {queues.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Layers size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nenhuma fila criada</h3>
          <p className="text-gray-500 mt-1 mb-4">Crie filas para organizar o atendimento por departamento</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {queues.map((q) => (
            <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: q.color + '20' }}>
                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: q.color }} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{q.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>{q.ticketCount} ticket{q.ticketCount !== 1 ? 's' : ''}</span>
                      <span>{q.users.length} membro{q.users.length !== 1 ? 's' : ''}</span>
                      <span>{q.whatsapps.length} WhatsApp</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openUserAssign(q.id)} className="p-2 rounded-lg hover:bg-blue-50 text-blue-500 transition" title="Membros">
                    <UserPlus size={18} />
                  </button>
                  <button onClick={() => openWaAssign(q.id)} className="p-2 rounded-lg hover:bg-green-50 text-green-500 transition" title="WhatsApp">
                    <Smartphone size={18} />
                  </button>
                  <button onClick={() => startEdit(q)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition" title="Editar">
                    <Edit3 size={18} />
                  </button>
                  <button onClick={() => handleDelete(q.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition" title="Remover">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {q.greetingMessage && (
                <p className="text-sm text-gray-500 mt-3 pl-[52px] italic">"{q.greetingMessage}"</p>
              )}

              {q.users.length > 0 && (
                <div className="flex items-center gap-2 mt-3 pl-[52px] flex-wrap">
                  <Users size={14} className="text-gray-400" />
                  {q.users.map(u => (
                    <span key={u.id} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{u.name}</span>
                  ))}
                </div>
              )}

              {q.whatsapps.length > 0 && (
                <div className="flex items-center gap-2 mt-2 pl-[52px] flex-wrap">
                  <Smartphone size={14} className="text-gray-400" />
                  {q.whatsapps.map(w => (
                    <span key={w.id} className={`text-xs px-2 py-0.5 rounded-full ${w.status === 'CONNECTED' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {w.phoneNumber || 'Desconectado'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* User Assign Modal */}
      {showUserAssign && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowUserAssign(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Membros da Fila</h2>
                <button onClick={() => setShowUserAssign(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={20} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {teamUsers.map(u => {
                const queue = queues.find(q => q.id === showUserAssign);
                const isInQueue = queue?.users.some(qu => qu.id === u.id) || false;
                return (
                  <button key={u.id} onClick={() => toggleUserInQueue(showUserAssign, u.id, isInQueue)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition flex items-center justify-between ${
                      isInQueue ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                    <div>
                      <p className="font-medium text-sm text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                    {isInQueue && <span className="text-xs font-medium text-indigo-600">Na fila</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Assign Modal */}
      {showWaAssign && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowWaAssign(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">WhatsApp da Fila</h2>
                <button onClick={() => setShowWaAssign(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={20} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {waSessions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum WhatsApp conectado</p>
              ) : (
                waSessions.map(w => {
                  const queue = queues.find(q => q.id === showWaAssign);
                  const isInQueue = queue?.whatsapps.some(qw => qw.id === w.id) || false;
                  return (
                    <button key={w.id} onClick={() => toggleWaInQueue(showWaAssign, w.id, isInQueue)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition flex items-center justify-between ${
                        isInQueue ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}>
                      <div className="flex items-center gap-3">
                        <Smartphone size={18} className={w.status === 'CONNECTED' ? 'text-green-600' : 'text-gray-400'} />
                        <div>
                          <p className="font-medium text-sm text-gray-900">{w.phoneNumber || 'Aguardando...'}</p>
                          <p className="text-xs text-gray-400">{w.status}</p>
                        </div>
                      </div>
                      {isInQueue && <span className="text-xs font-medium text-green-600">Associado</span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
