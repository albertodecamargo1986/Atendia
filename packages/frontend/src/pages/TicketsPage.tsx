import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare, CheckCircle, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, StickyNote, X, Search,
  Phone, Inbox, Plus, ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { useSocketEvent, useSocketSubscription } from '../hooks/useSocket';
import { useNotificationSound } from '../hooks/useNotificationSound';
import { useTags } from '../hooks/useTags';
import { useAuthStore } from '../stores/auth';
import {
  MessageBubble, ChatComposer, TransferModal, NoteModal, uploadMedia, type ChatMessage,
} from '../components/chat/ChatParts';
import { Modal } from '../components/ui/Modal';
import { askConfirm } from '../components/ui/ConfirmDialog';

interface Ticket {
  id: string;
  status: string;
  unreadMessages: number;
  lastMessage: string | null;
  isGroup: boolean;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact: { id: string; name: string; phone: string; profilePicUrl?: string };
  queue: { id: string; name: string; color: string } | null;
  assignee: { id: string; name: string } | null;
  conversation: { id: string; channel: string; status?: string; agent?: { id: string; name: string } };
  ticketTags?: { tagId: string; tag: { id: string; name: string; color: string } }[];
}

interface QueueCount { id: string; name: string; color: string; count: number }

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Aguardando', cls: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]' },
  OPEN: { label: 'Em atendimento', cls: 'bg-[var(--color-success-bg)] text-[var(--color-success)]' },
  CLOSED: { label: 'Encerrado', cls: 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]' },
};

const STATUS_TABS: { status: string; label: string; icon: typeof Inbox; key: 'pending' | 'open' | 'closed' }[] = [
  { status: 'PENDING', label: 'Aguardando', icon: Inbox, key: 'pending' },
  { status: 'OPEN', label: 'Em atendimento', icon: MessageSquare, key: 'open' },
  { status: 'CLOSED', label: 'Encerrados', icon: CheckCircle, key: 'closed' },
];

export default function TicketsPage() {
  const { user } = useAuthStore();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [convStatus, setConvStatus] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const [activeStatus, setActiveStatus] = useState<string>('PENDING');
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
  const [queueCounts, setQueueCounts] = useState<QueueCount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ pending: 0, open: 0, closed: 0, total: 0, withUnread: 0 });

  const [showTransfer, setShowTransfer] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);

  const { tags, addTagToTicket, removeTagFromTicket } = useTags();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { playBeep } = useNotificationSound();

  const selectedTicket = tickets.find((t) => t.id === selectedId);

  const fetchTickets = useCallback(async (showError = false) => {
    try {
      const params = new URLSearchParams();
      params.set('status', activeStatus);
      if (activeQueueId) params.set('queueId', activeQueueId);
      if (searchTerm) params.set('search', searchTerm);
      const { data } = await api.get(`/tickets?${params}`);
      setTickets(data.tickets || []);
    } catch (err) {
      if (showError) toast.error(getErrorMessage(err, 'Não foi possível carregar os atendimentos.'));
    } finally {
      setLoading(false);
    }
  }, [activeStatus, activeQueueId, searchTerm]);

  const fetchStats = useCallback(async () => {
    try { const { data } = await api.get('/tickets/stats'); setStats((s) => ({ ...s, ...data })); } catch { /* números do topo: tenta de novo no próximo evento */ }
  }, []);

  const fetchQueueCounts = useCallback(async () => {
    try { const { data } = await api.get('/tickets/queue-counts'); setQueueCounts(Array.isArray(data) ? data : []); } catch { setQueueCounts([]); }
  }, []);

  const fetchMessages = useCallback(async (ticketId: string) => {
    try {
      const { data } = await api.get(`/tickets/${ticketId}`);
      setMessages(data.conversation?.messages || []);
      setConvStatus(data.conversation?.status);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível carregar as mensagens.'));
    }
  }, []);

  useEffect(() => { fetchStats(); fetchQueueCounts(); }, [fetchStats, fetchQueueCounts]);
  useEffect(() => {
    const t = setTimeout(() => fetchTickets(true), searchTerm ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchTickets, searchTerm]);
  useEffect(() => { if (selectedId) fetchMessages(selectedId); else setMessages([]); }, [selectedId, fetchMessages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Tempo real ──
  useSocketSubscription('ticket:subscribe-status', 'ticket:unsubscribe-status', 'PENDING');
  useSocketSubscription('ticket:subscribe-status', 'ticket:unsubscribe-status', 'OPEN');
  useSocketSubscription('ticket:subscribe-status', 'ticket:unsubscribe-status', 'CLOSED');
  useSocketSubscription('ticket:subscribe', 'ticket:unsubscribe', selectedId);

  const refreshAll = () => { fetchTickets(); fetchStats(); fetchQueueCounts(); };
  useSocketEvent('ticket:create', refreshAll);
  useSocketEvent('ticket:update', () => { fetchTickets(); fetchStats(); });
  useSocketEvent('ticket:delete', () => { fetchTickets(); fetchStats(); });
  useSocketEvent('ticket:assign', () => { fetchTickets(); fetchStats(); toast.info('Um atendimento foi direcionado para você.'); });
  useSocketEvent<{ conversationId: string; message: ChatMessage }>('message:new', (data) => {
    if (selectedTicket && data.conversationId === selectedTicket.conversation.id) {
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
    }
    if (data.message?.role === 'USER') playBeep();
  });

  async function act(fn: () => Promise<unknown>, success: string, fallback: string) {
    try {
      await fn();
      toast.success(success);
      fetchTickets(); fetchStats();
      if (selectedId) fetchMessages(selectedId);
    } catch (err) {
      toast.error(getErrorMessage(err, fallback));
    }
  }

  const handleAccept = () => selectedId && act(() => api.post(`/tickets/${selectedId}/accept`), 'Atendimento aceito. Agora é com você!', 'Não foi possível aceitar.');
  const handleReopen = () => selectedId && act(() => api.post(`/tickets/${selectedId}/reopen`), 'Atendimento reaberto.', 'Não foi possível reabrir.');

  async function handleClose() {
    if (!selectedId) return;
    const ok = await askConfirm({ title: 'Encerrar este atendimento?', description: 'Se o cliente escrever de novo, um novo atendimento é aberto.', confirmLabel: 'Encerrar' });
    if (ok) act(() => api.post(`/tickets/${selectedId}/close`), 'Atendimento encerrado.', 'Não foi possível encerrar.');
  }

  const handleEscalate = () => selectedTicket && act(
    () => api.post(`/conversations/${selectedTicket.conversation.id}/escalate`),
    'Você assumiu a conversa. A IA parou de responder.', 'Não foi possível assumir a conversa.');

  const handleReturnToAgent = () => selectedTicket && act(
    () => api.post(`/conversations/${selectedTicket.conversation.id}/return-to-agent`),
    'Conversa devolvida para a IA.', 'Não foi possível devolver para a IA.');

  async function ensureHumanMode(ticket: Ticket) {
    if ((convStatus ?? ticket.conversation.status) === 'ACTIVE') {
      await api.post(`/conversations/${ticket.conversation.id}/escalate`);
      setConvStatus('HUMAN_TAKEOVER');
    }
  }

  async function handleSendText(text: string): Promise<boolean> {
    if (!selectedTicket) return false;
    try {
      await ensureHumanMode(selectedTicket);
      await api.post(`/conversations/${selectedTicket.conversation.id}/messages`, { content: text, role: 'ASSISTANT' });
      await fetchMessages(selectedTicket.id);
      fetchTickets();
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível enviar a mensagem.'));
      return false;
    }
  }

  async function handleSendFile(file: File) {
    if (!selectedTicket) return;
    try {
      const upload = await uploadMedia(file);
      await ensureHumanMode(selectedTicket);
      await api.post(`/conversations/${selectedTicket.conversation.id}/messages`, {
        content: file.name, role: 'ASSISTANT', mediaUrl: upload.mediaUrl, mediaType: upload.mediaType,
      });
      toast.success('Arquivo enviado.');
      await fetchMessages(selectedTicket.id);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível enviar o arquivo.'));
    }
  }

  async function handleTransfer(toUserId: string) {
    if (!selectedTicket) return;
    try {
      await api.post(`/conversations/${selectedTicket.conversation.id}/transfer`, { toUserId });
      toast.success('Atendimento transferido.');
      setShowTransfer(false);
      fetchTickets();
      fetchMessages(selectedTicket.id);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível transferir.'));
    }
  }

  async function handleAddNote(content: string): Promise<boolean> {
    if (!selectedTicket || !content) return false;
    try {
      await api.post(`/conversations/${selectedTicket.conversation.id}/note`, { content });
      toast.success('Nota salva.');
      fetchMessages(selectedTicket.id);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar a nota.'));
      return false;
    }
  }

  function selectTicket(id: string) {
    setSelectedId(id);
    api.post(`/tickets/${id}/read`).then(() => fetchTickets()).catch(() => { /* marcar como lido é opcional */ });
  }

  async function handleAddTag(tagId: string) {
    if (!selectedId) return;
    try {
      await addTagToTicket(selectedId, tagId);
      toast.success('Etiqueta adicionada.');
      fetchTickets();
      setShowTagModal(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível adicionar a etiqueta.'));
    }
  }

  async function handleRemoveTag(tagId: string) {
    if (!selectedId) return;
    try {
      await removeTagFromTicket(selectedId, tagId);
      toast.success('Etiqueta removida.');
      fetchTickets();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível remover a etiqueta.'));
    }
  }

  function chooseStatus(status: string, queueId: string | null = null) {
    setActiveQueueId(queueId);
    setActiveStatus(status);
    setSelectedId(null);
  }

  const actionBtn = 'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition border border-[var(--border-color)] hover:bg-[var(--surface-tertiary)]';
  const isAiActive = (convStatus ?? selectedTicket?.conversation.status) === 'ACTIVE';

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] lg:h-[calc(100dvh-5.5rem)] rounded-xl overflow-hidden border border-[var(--border-color)]">
      {/* Filtros (computador) */}
      <div className="hidden lg:flex w-56 border-r border-[var(--border-color)] bg-[var(--surface-primary)] flex-col overflow-y-auto">
        <div className="p-4 border-b border-[var(--border-color)]">
          <h1 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide">Atendimentos</h1>
        </div>
        <div className="p-2 space-y-0.5">
          {STATUS_TABS.map(({ status, label, icon: Icon, key }) => (
            <button key={status} onClick={() => chooseStatus(status)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${!activeQueueId && activeStatus === status ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-600)] font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>
              <span className="flex items-center gap-2"><Icon size={16} /> {label}</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--surface-tertiary)] text-[var(--text-secondary)]">{stats[key]}</span>
            </button>
          ))}
        </div>

        {queueCounts.length > 0 && (
          <>
            <div className="px-4 pt-3 pb-1 text-xs font-semibold text-[var(--text-tertiary)] uppercase">Por fila</div>
            <div className="px-2 pb-2 space-y-0.5">
              {queueCounts.map((q) => (
                <button key={q.id} onClick={() => chooseStatus('PENDING', q.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${activeQueueId === q.id ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-600)] font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: q.color }} />
                    {q.name}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--surface-tertiary)] text-[var(--text-secondary)]">{q.count}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-auto p-3 border-t border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
          {stats.withUnread} com mensagens não lidas
        </div>
      </div>

      {/* Lista */}
      <div className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-80 md:border-r border-[var(--border-color)] bg-[var(--surface-primary)] flex-col`}>
        <div className="p-3 border-b border-[var(--border-color)] space-y-2">
          <div className="flex lg:hidden gap-1 overflow-x-auto">
            {STATUS_TABS.map(({ status, label, key }) => (
              <button key={status} onClick={() => chooseStatus(status)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${activeStatus === status && !activeQueueId ? 'bg-[var(--color-primary-500)] text-white' : 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]'}`}>
                {label} ({stats[key]})
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar contato ou mensagem..." aria-label="Buscar atendimentos"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-[var(--text-tertiary)]">Carregando...</div>
          ) : tickets.length === 0 ? (
            <div className="p-6 text-center text-sm text-[var(--text-tertiary)]">Nenhum atendimento aqui por enquanto.</div>
          ) : (
            tickets.map((ticket) => {
              const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.PENDING;
              return (
                <button key={ticket.id} onClick={() => selectTicket(ticket.id)}
                  className={`w-full text-left p-3 border-b border-[var(--border-color)] hover:bg-[var(--surface-secondary)] transition ${
                    selectedId === ticket.id ? 'bg-[var(--color-primary-50)] border-l-2 border-l-[var(--color-primary-500)]' : ''
                  }`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--surface-tertiary)] flex items-center justify-center shrink-0 text-sm font-medium text-[var(--text-secondary)]">
                      {(ticket.contact.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-[var(--text-primary)] truncate">{ticket.contact.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {ticket.unreadMessages > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--color-primary-500)] text-white" aria-label={`${ticket.unreadMessages} não lidas`}>{ticket.unreadMessages}</span>
                          )}
                          {ticket.queue && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ticket.queue.color }} />}
                        </div>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{ticket.lastMessage || 'Sem mensagem'}</p>
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
                        {ticket.ticketTags?.map((tt) => (
                          <span key={tt.tagId} className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: tt.tag.color }}>{tt.tag.name}</span>
                        ))}
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {ticket.conversation.channel === 'WHATSAPP' ? <Phone size={10} className="inline" /> : null}
                          {' '}{new Date(ticket.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {ticket.assignee && <span className="text-xs text-[var(--text-tertiary)]">· {ticket.assignee.name}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Conversa */}
      <div className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-[var(--surface-secondary)] min-w-0`}>
        {selectedTicket ? (
          <>
            <div className="bg-[var(--surface-primary)] border-b border-[var(--border-color)] px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <button onClick={() => setSelectedId(null)} className="md:hidden p-1.5 rounded-lg hover:bg-[var(--surface-tertiary)]" aria-label="Voltar para a lista">
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                  <h2 className="font-semibold text-[var(--text-primary)] truncate">{selectedTicket.contact.name}</h2>
                  <p className="text-xs text-[var(--text-tertiary)] truncate">
                    {selectedTicket.contact.phone}
                    {selectedTicket.queue && <span> · Fila: {selectedTicket.queue.name}</span>}
                    {selectedTicket.assignee && <span className="text-[var(--color-primary-500)]"> · {selectedTicket.assignee.name}</span>}
                    {isAiActive && <span className="text-[var(--color-success)]"> · IA atendendo</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {selectedTicket.ticketTags?.map((tt) => (
                      <button key={tt.tagId} type="button" onClick={() => handleRemoveTag(tt.tagId)}
                        className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: tt.tag.color }}
                        title="Remover etiqueta" aria-label={`Remover etiqueta ${tt.tag.name}`}>
                        {tt.tag.name} <X size={10} />
                      </button>
                    ))}
                    <button onClick={() => setShowTagModal(true)} className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--surface-tertiary)] text-[var(--text-secondary)] hover:opacity-80 transition" aria-label="Adicionar etiqueta">
                      <Plus size={10} className="inline" /> etiqueta
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedTicket.status === 'PENDING' && (
                  <button onClick={handleAccept} className={`${actionBtn} text-[var(--color-success)]`}>
                    <CheckCircle size={14} /> Aceitar
                  </button>
                )}
                {isAiActive && selectedTicket.status !== 'CLOSED' && (
                  <button onClick={handleEscalate} className={`${actionBtn} text-[var(--color-warning)]`}>
                    <ArrowUpRight size={14} /> Assumir conversa
                  </button>
                )}
                {convStatus === 'HUMAN_TAKEOVER' && selectedTicket.status !== 'CLOSED' && (
                  <button onClick={handleReturnToAgent} className={`${actionBtn} text-[var(--color-info)]`}>
                    <ArrowDownLeft size={14} /> Devolver para a IA
                  </button>
                )}
                {selectedTicket.status === 'OPEN' && (
                  <>
                    <button onClick={() => setShowTransfer(true)} className={`${actionBtn} text-[var(--text-primary)]`}>
                      <ArrowLeftRight size={14} /> Transferir
                    </button>
                    <button onClick={() => setShowNote(true)} className={`${actionBtn} text-[var(--text-primary)]`}>
                      <StickyNote size={14} /> Nota
                    </button>
                    <button onClick={handleClose} className={`${actionBtn} text-[var(--text-secondary)]`}>
                      <CheckCircle size={14} /> Encerrar
                    </button>
                  </>
                )}
                {selectedTicket.status === 'CLOSED' && (
                  <button onClick={handleReopen} className={`${actionBtn} text-[var(--color-info)]`}>
                    <ArrowDownLeft size={14} /> Reabrir
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} humanMode={convStatus === 'HUMAN_TAKEOVER'} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {selectedTicket.status === 'CLOSED' ? (
              <div className="bg-[var(--surface-primary)] border-t border-[var(--border-color)] p-4 text-center text-sm text-[var(--text-tertiary)]">
                Atendimento encerrado. Clique em "Reabrir" para responder.
              </div>
            ) : (
              <>
                {isAiActive && (
                  <p className="bg-[var(--surface-primary)] border-t border-[var(--border-color)] px-4 pt-2 text-xs text-[var(--text-secondary)]">
                    A IA está atendendo. Se você enviar uma mensagem, assume a conversa e a IA para de responder.
                  </p>
                )}
                <ChatComposer onSendText={handleSendText} onSendFile={handleSendFile} />
              </>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)]">
            <div className="text-center">
              <Inbox size={48} className="mx-auto mb-3" />
              <p>Selecione um atendimento</p>
            </div>
          </div>
        )}
      </div>

      <TransferModal open={showTransfer} onClose={() => setShowTransfer(false)} onConfirm={handleTransfer} excludeUserId={user?.id} />
      <NoteModal open={showNote} onClose={() => setShowNote(false)} onSave={handleAddNote} />

      <Modal open={showTagModal} onClose={() => setShowTagModal(false)} title="Adicionar etiqueta" size="sm">
        {tags.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] text-center py-4">
            Nenhuma etiqueta criada ainda. Crie etiquetas no menu "Etiquetas".
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {tags.map((tag) => {
              const alreadyAdded = selectedTicket?.ticketTags?.some((tt) => tt.tagId === tag.id);
              return (
                <button key={tag.id} type="button" disabled={alreadyAdded} onClick={() => handleAddTag(tag.id)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-[var(--border-color)] transition flex items-center justify-between hover:bg-[var(--surface-secondary)] disabled:opacity-60 disabled:hover:bg-transparent">
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span className="font-medium text-sm text-[var(--text-primary)]">{tag.name}</span>
                  </span>
                  {alreadyAdded && <span className="text-xs text-[var(--text-tertiary)]">Já adicionada</span>}
                </button>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
