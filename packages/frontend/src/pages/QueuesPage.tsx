import { useState, useEffect } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { toast } from 'sonner';
import api from '../services/api';
import { Layers, Plus, Trash2, Edit3, X, Users, Smartphone, UserPlus } from 'lucide-react';
import { getErrorMessage } from '../lib/errors';
import { askConfirm } from '../components/ui/ConfirmDialog';
import { fetchColleagues } from '../components/chat/ChatParts';

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
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.patch(`/queues/${editingId}`, form);
        toast.success('Alterações salvas!');
      } else {
        await api.post('/queues', form);
        toast.success('Salvo com sucesso!');
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: '', color: '#6366f1', greetingMessage: '' });
      fetchQueues();
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao salvar'));
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!(await askConfirm({ title: 'Remover esta fila?', confirmLabel: 'Confirmar', danger: true }))) return;
    try {
      await api.delete(`/queues/${id}`);
      toast.success('Removido com sucesso.');
      fetchQueues();
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao remover'));
    }
  }

  function startEdit(q: QueueData) {
    setEditingId(q.id);
    setForm({ name: q.name, color: q.color, greetingMessage: q.greetingMessage || '' });
    setShowForm(true);
  }

  async function openUserAssign(queueId: string) {
    try {
      const list = await fetchColleagues();
      setTeamUsers(list.map((u) => ({ id: u.id, name: u.name, email: '', role: u.role || '', isActive: true })));
      setShowUserAssign(queueId);
    } catch (err) { toast.error(getErrorMessage(err)); }
  }

  async function openWaAssign(queueId: string) {
    try {
      const { data } = await api.get('/whatsapp');
      setWaSessions(data);
      setShowWaAssign(queueId);
    } catch (err) { toast.error(getErrorMessage(err)); }
  }

  async function toggleUserInQueue(queueId: string, userId: string, isInQueue: boolean) {
    try {
      if (isInQueue) {
        await api.delete(`/queues/${queueId}/users/${userId}`);
        toast.success('Pessoa removida da fila.');
      } else {
        await api.post(`/queues/${queueId}/users/${userId}`);
        toast.success('Pessoa adicionada à fila.');
      }
      fetchQueues();
    } catch (err) { toast.error(getErrorMessage(err)); }
  }

  async function toggleWaInQueue(queueId: string, sessionId: string, isInQueue: boolean) {
    try {
      if (isInQueue) {
        await api.delete(`/queues/${queueId}/whatsapp/${sessionId}`);
        toast.success('Número removido da fila.');
      } else {
        await api.post(`/queues/${queueId}/whatsapp/${sessionId}`);
        toast.success('Número adicionado à fila.');
      }
      fetchQueues();
    } catch (err) { toast.error(getErrorMessage(err)); }
  }

  const presetColors = ['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-[var(--text-secondary)]">Carregando filas...</p></div>;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Filas de atendimento"
        description="Organize o atendimento por departamento ou time"
        actions={
          <button onClick={() => { setEditingId(null); setForm({ name: '', color: '#6366f1', greetingMessage: '' }); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition">
            <Plus size={18} /> Nova fila
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
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{editingId ? 'Editar Fila' : 'Nova Fila'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]" aria-label="Fechar"><X size={20} /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Nome *</label>
                  <input type="text" required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                    placeholder="Ex: Suporte, Vendas, Financeiro" />
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
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Mensagem de saudação</label>
                  <textarea value={form.greetingMessage} onChange={(e) => setForm(f => ({ ...f, greetingMessage: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                    placeholder="Olá! Em que podemos ajudar?" />
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">Enviada automaticamente quando um atendimento entra na fila</p>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowForm(false)}
                    className="px-4 py-2.5 text-sm text-[var(--text-primary)] bg-[var(--surface-tertiary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">Cancelar</button>
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

      {/* Queue List */}
      {queues.length === 0 ? (
        <div className="text-center py-16 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)]">
          <Layers size={48} className="mx-auto text-[var(--text-tertiary)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)]">Nenhuma fila criada</h3>
          <p className="text-[var(--text-secondary)] mt-1 mb-4">Crie filas para organizar o atendimento por departamento</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {queues.map((q) => (
            <div key={q.id} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: q.color + '20' }}>
                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: q.color }} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{q.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-tertiary)]">
                      <span>{q.ticketCount} atendimento{q.ticketCount !== 1 ? 's' : ''}</span>
                      <span>{q.users.length} membro{q.users.length !== 1 ? 's' : ''}</span>
                      <span>{q.whatsapps.length} WhatsApp</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openUserAssign(q.id)} className="p-2 rounded-lg hover:bg-[var(--color-info-bg)] text-blue-500 transition" title="Membros" aria-label="Membros">
                    <UserPlus size={18} />
                  </button>
                  <button onClick={() => openWaAssign(q.id)} className="p-2 rounded-lg hover:bg-[var(--color-success-bg)] text-green-500 transition" title="WhatsApp" aria-label="WhatsApp">
                    <Smartphone size={18} />
                  </button>
                  <button onClick={() => startEdit(q)} className="p-2 rounded-lg hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] transition" title="Editar" aria-label="Editar">
                    <Edit3 size={18} />
                  </button>
                  <button onClick={() => handleDelete(q.id)} className="p-2 rounded-lg hover:bg-[var(--color-error-bg)] text-red-400 transition" title="Remover" aria-label="Remover">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {q.greetingMessage && (
                <p className="text-sm text-[var(--text-secondary)] mt-3 pl-[52px] italic">"{q.greetingMessage}"</p>
              )}

              {q.users.length > 0 && (
                <div className="flex items-center gap-2 mt-3 pl-[52px] flex-wrap">
                  <Users size={14} className="text-[var(--text-tertiary)]" />
                  {q.users.map(u => (
                    <span key={u.id} className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-tertiary)] text-[var(--text-secondary)]">{u.name}</span>
                  ))}
                </div>
              )}

              {q.whatsapps.length > 0 && (
                <div className="flex items-center gap-2 mt-2 pl-[52px] flex-wrap">
                  <Smartphone size={14} className="text-[var(--text-tertiary)]" />
                  {q.whatsapps.map(w => (
                    <span key={w.id} className={`text-xs px-2 py-0.5 rounded-full ${w.status === 'CONNECTED' ? 'bg-[var(--color-success-bg)] text-green-600' : 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]'}`}>
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
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-[var(--border-color)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Membros da Fila</h2>
                <button onClick={() => setShowUserAssign(null)} className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]" aria-label="Fechar"><X size={20} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {teamUsers.map(u => {
                const queue = queues.find(q => q.id === showUserAssign);
                const isInQueue = queue?.users.some(qu => qu.id === u.id) || false;
                return (
                  <button key={u.id} onClick={() => toggleUserInQueue(showUserAssign, u.id, isInQueue)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition flex items-center justify-between ${
                      isInQueue ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]' : 'border-[var(--border-color)] hover:bg-[var(--surface-secondary)]'
                    }`}>
                    <div>
                      <p className="font-medium text-sm text-[var(--text-primary)]">{u.name}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{u.role}</p>
                    </div>
                    {isInQueue && <span className="text-xs font-medium text-[var(--color-primary-500)]">Na fila</span>}
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
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-[var(--border-color)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">WhatsApp da Fila</h2>
                <button onClick={() => setShowWaAssign(null)} className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]" aria-label="Fechar"><X size={20} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {waSessions.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Nenhum WhatsApp conectado</p>
              ) : (
                waSessions.map(w => {
                  const queue = queues.find(q => q.id === showWaAssign);
                  const isInQueue = queue?.whatsapps.some(qw => qw.id === w.id) || false;
                  return (
                    <button key={w.id} onClick={() => toggleWaInQueue(showWaAssign, w.id, isInQueue)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition flex items-center justify-between ${
                        isInQueue ? 'border-green-500 bg-[var(--color-success-bg)]' : 'border-[var(--border-color)] hover:bg-[var(--surface-secondary)]'
                      }`}>
                      <div className="flex items-center gap-3">
                        <Smartphone size={18} className={w.status === 'CONNECTED' ? 'text-green-600' : 'text-[var(--text-tertiary)]'} />
                        <div>
                          <p className="font-medium text-sm text-[var(--text-primary)]">{w.phoneNumber || 'Aguardando...'}</p>
                          <p className="text-xs text-[var(--text-tertiary)]">{w.status}</p>
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
