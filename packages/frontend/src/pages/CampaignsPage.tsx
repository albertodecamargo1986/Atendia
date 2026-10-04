import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '../services/api';
import { Megaphone, Plus, Play, XCircle, Trash2, X, Pause, ShieldCheck } from 'lucide-react';
import { getErrorMessage } from '../lib/errors';
import { askConfirm } from '../components/ui/ConfirmDialog';

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
  whatsappSession?: { id: string; phoneNumber: string | null; status: string } | null;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
}

interface WhatsAppSession {
  id: string;
  phoneNumber: string | null;
  status: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [form, setForm] = useState({ name: '', message: '', scheduledAt: '', whatsappSessionId: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchCampaigns(); }, []);

  async function fetchCampaigns() {
    try { const { data } = await api.get('/campaigns'); setCampaigns(data.data || data); }
    catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  }

  async function openForm() {
    setShowForm(true);
    if (!contactsLoaded) {
      try {
        // Só contatos que podem receber: conversaram nos últimos 90 dias e não pediram para sair
        const { data } = await api.get('/campaigns/eligible-contacts');
        setContacts(data.data?.contacts || []);
        setContactsLoaded(true);
      } catch (err) { toast.error(getErrorMessage(err)); }
    }
    try {
      const { data } = await api.get('/whatsapp');
      const list: WhatsAppSession[] = Array.isArray(data) ? data : data.data || [];
      setSessions(list);
      const firstConnected = list.find((s) => s.status === 'CONNECTED');
      setForm((f) => ({ ...f, whatsappSessionId: f.whatsappSessionId || firstConnected?.id || '' }));
    } catch { /* sem permissão para listar números: usa o padrão do servidor */ }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/campaigns', {
        name: form.name,
        message: form.message,
        contactIds: selectedContacts,
        scheduledAt: form.scheduledAt || undefined,
        whatsappSessionId: form.whatsappSessionId || undefined,
      });
      const excluded = data?.data?.excludedCount || 0;
      toast.success(excluded > 0
        ? `Campanha criada! ${excluded} contato(s) ficaram de fora pelas regras de envio.`
        : 'Campanha criada!');
      setShowForm(false);
      setForm({ name: '', message: '', scheduledAt: '', whatsappSessionId: '' });
      setSelectedContacts([]);
      fetchCampaigns();
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao criar campanha'));
    } finally { setSaving(false); }
  }

  async function handleStart(id: string, resume = false) {
    try {
      await api.post(`/campaigns/${id}/start`);
      toast.success(resume ? 'Campanha retomada.' : 'Campanha iniciada! As mensagens serão enviadas aos poucos (25 a 60 s entre cada uma).');
      fetchCampaigns();
    } catch (err) { toast.error(getErrorMessage(err)); }
  }

  async function handlePause(id: string) {
    try { await api.post(`/campaigns/${id}/pause`); toast.success('Campanha pausada.'); fetchCampaigns(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  }

  async function handleCancel(id: string, running: boolean) {
    if (running && !(await askConfirm({
      title: 'Cancelar esta campanha?',
      description: 'Os contatos que ainda não receberam não vão receber a mensagem.',
      confirmLabel: 'Cancelar campanha',
      danger: true,
    }))) return;
    try { await api.post(`/campaigns/${id}/cancel`); toast.success('Campanha cancelada.'); fetchCampaigns(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  }

  async function handleDelete(id: string) {
    if (!(await askConfirm({ title: 'Excluir esta campanha?', confirmLabel: 'Confirmar', danger: true }))) return;
    try { await api.delete(`/campaigns/${id}`); toast.success('Removido com sucesso.'); fetchCampaigns(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  }

  function toggleContact(id: string) {
    setSelectedContacts(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  function toggleAll() {
    setSelectedContacts(prev => prev.length === contacts.length ? [] : contacts.map(c => c.id));
  }

  const statusColors: Record<string, string> = {
    DRAFT: 'bg-[var(--surface-tertiary)] text-[var(--text-primary)]',
    SCHEDULED: 'bg-blue-100 text-blue-700',
    RUNNING: 'bg-yellow-100 text-yellow-700',
    PAUSED: 'bg-orange-100 text-orange-700',
    COMPLETED: 'bg-green-100 text-[var(--color-success)]',
    CANCELLED: 'bg-red-100 text-[var(--color-error)]',
  };

  const statusLabels: Record<string, string> = {
    DRAFT: 'Rascunho',
    SCHEDULED: 'Agendada',
    RUNNING: 'Enviando',
    PAUSED: 'Pausada',
    COMPLETED: 'Concluída',
    CANCELLED: 'Cancelada',
  };

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-[var(--text-secondary)]">Carregando...</p></div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Campanhas</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Envie mensagens para clientes que já conversaram com você</p>
        </div>
        <button onClick={openForm}
          className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition">
          <Plus size={18} /> Nova Campanha
        </button>
      </div>

      <div className="bg-[var(--color-info-bg)] border border-[var(--border-color)] rounded-xl p-4 mb-5 text-sm text-[var(--text-primary)]">
        <div className="flex items-center gap-2 font-semibold mb-2"><ShieldCheck size={18} /> Regras para proteger o seu número</div>
        <ul className="list-disc pl-5 space-y-1 text-[var(--text-secondary)]">
          <li><strong>Quem recebe:</strong> só contatos que mandaram mensagem nos últimos 90 dias e não pediram para sair.</li>
          <li><strong>Ritmo:</strong> uma mensagem a cada 25 a 60 segundos, com pausa de 10 a 20 minutos a cada 25 envios.</li>
          <li><strong>Cota:</strong> até 200 por dia por número. Número conectado há menos de 14 dias começa com 20 por dia e sobe 20% ao dia.</li>
          <li><strong>Horário:</strong> segunda a sexta, das 9h às 19h (horário de Brasília). Fora disso, a campanha espera.</li>
          <li><strong>Sair:</strong> quem responder SAIR, PARAR, STOP, CANCELAR ou DESCADASTRAR não recebe mais.</li>
          <li>Uma campanha por vez em cada número. Se o WhatsApp limitar o número, os envios automáticos param por 24 horas.</li>
        </ul>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Nova Campanha</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]" aria-label="Fechar"><X size={20} /></button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Nome *</label>
                  <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Número que envia *</label>
                  <select value={form.whatsappSessionId} onChange={e => setForm(f => ({ ...f, whatsappSessionId: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] text-sm bg-[var(--surface-primary)] focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none">
                    <option value="">Primeiro número conectado</option>
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.phoneNumber || 'Número sem identificação'}{s.status !== 'CONNECTED' ? ' (desconectado)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Mensagem *</label>
                  <textarea required rows={4} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="{Olá|Oi} {nome}, tudo bem? ..."
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none resize-none" />
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Use <code>{'{nome}'}</code> para o primeiro nome do contato e <code>{'{Olá|Oi|Bom dia}'}</code> para variar o texto entre os contatos (cada um recebe uma das opções).
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Agendar para (opcional)</label>
                  <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-[var(--text-primary)]">
                      Contatos ({selectedContacts.length} de {contacts.length} que podem receber)
                    </label>
                    {contacts.length > 0 && (
                      <button type="button" onClick={toggleAll} className="text-xs text-[var(--color-primary-500)] hover:underline">
                        {selectedContacts.length === contacts.length ? 'Limpar' : 'Selecionar todos'}
                      </button>
                    )}
                  </div>
                  <div className="border border-[var(--border-color)] rounded-lg max-h-40 overflow-y-auto">
                    {contacts.map(c => (
                      <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--surface-secondary)] cursor-pointer text-sm">
                        <input type="checkbox" checked={selectedContacts.includes(c.id)} onChange={() => toggleContact(c.id)}
                          className="rounded border-[var(--border-color)] text-[var(--color-primary-500)] focus:ring-[var(--color-primary-500)]" />
                        <span className="text-[var(--text-primary)]">{c.name}</span>
                        <span className="text-[var(--text-tertiary)] text-xs">{c.phone}</span>
                      </label>
                    ))}
                    {contacts.length === 0 && (
                      <p className="text-sm text-[var(--text-tertiary)] text-center py-4 px-3">
                        Nenhum contato pode receber agora: só quem mandou mensagem nos últimos 90 dias e não pediu para sair.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-[var(--text-primary)] bg-[var(--surface-tertiary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">Cancelar</button>
                  <button type="submit" disabled={saving || !form.name.trim() || !form.message.trim() || selectedContacts.length === 0}
                    className="px-4 py-2.5 bg-[var(--color-primary-500)] text-white text-sm font-medium rounded-lg hover:bg-[var(--color-primary-600)] disabled:opacity-50 transition">
                    {saving ? 'Criando...' : 'Criar Campanha'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="text-center py-16 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)]">
          <Megaphone size={48} className="mx-auto text-[var(--text-tertiary)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)]">Nenhuma campanha</h3>
          <p className="text-[var(--text-secondary)] mt-1 mb-4">Crie campanhas para falar com clientes que já conversaram com você</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <div key={c.id} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-[var(--text-primary)]">{c.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[c.status] || 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]'}`}>
                      {statusLabels[c.status] || c.status}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-2">{c.message}</p>
                  <div className="flex flex-wrap gap-4 mt-2 text-xs text-[var(--text-tertiary)]">
                    <span>{c.totalRecipients} destinatários</span>
                    <span className="text-green-600">{c.sentCount} enviados</span>
                    {c.failedCount > 0 && <span className="text-[var(--color-error)]">{c.failedCount} não enviados</span>}
                    {c.whatsappSession?.phoneNumber && <span>Número: {c.whatsappSession.phoneNumber}</span>}
                    {c.scheduledAt && <span>Agendado: {new Date(c.scheduledAt).toLocaleString('pt-BR')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(c.status === 'DRAFT' || c.status === 'PAUSED') && (
                    <button onClick={() => handleStart(c.id, c.status === 'PAUSED')} className="p-2 rounded-lg bg-[var(--color-success-bg)] text-green-600 hover:bg-green-100 transition"
                      title={c.status === 'PAUSED' ? 'Retomar' : 'Iniciar'} aria-label={c.status === 'PAUSED' ? 'Retomar' : 'Iniciar'}><Play size={16} /></button>
                  )}
                  {c.status === 'RUNNING' && (
                    <button onClick={() => handlePause(c.id)} className="p-2 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition" title="Pausar" aria-label="Pausar"><Pause size={16} /></button>
                  )}
                  {['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED'].includes(c.status) && (
                    <button onClick={() => handleCancel(c.id, c.status === 'RUNNING' || c.status === 'PAUSED')} className="p-2 rounded-lg bg-[var(--color-warning-bg)] text-yellow-600 hover:bg-yellow-100 transition" title="Cancelar" aria-label="Cancelar"><XCircle size={16} /></button>
                  )}
                  {c.status !== 'RUNNING' && (
                    <button onClick={() => handleDelete(c.id)} className="p-2 rounded-lg bg-[var(--color-error-bg)] text-[var(--color-error)] hover:bg-red-100 transition" title="Deletar" aria-label="Deletar"><Trash2 size={16} /></button>
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
