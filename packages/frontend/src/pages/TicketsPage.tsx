import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare, CheckCircle, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, StickyNote, X, Search,
  Phone, Inbox, Plus, ArrowLeft, Bot, Save, Clock, UserRound, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import api from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { maskPhone, maskCPFCNPJ, maskCEP } from '../lib/masks';
import { useSocketEvent, useSocketSubscription } from '../hooks/useSocket';
import { useNotificationSound } from '../hooks/useNotificationSound';
import { useTags } from '../hooks/useTags';
import { useAuthStore } from '../stores/auth';
import {
  MessageBubble, ChatComposer, TransferModal, NoteModal, uploadMedia, type ChatMessage,
} from '../components/chat/ChatParts';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { askConfirm } from '../components/ui/ConfirmDialog';
import TemplatePickerModal from '../components/chat/TemplatePickerModal';

/** API oficial (Cloud API): situação da janela de 24 h da conversa. */
interface WaWindow {
  provider: 'CLOUD_API' | 'BAILEYS' | null;
  insideWindow: boolean;
  windowEndsAt: string | null;
}

// ── Tipos ──

interface ContactInfo {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  cpfCnpj?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  company?: string | null;
  role?: string | null;
  notes?: string | null;
  profilePicUrl?: string | null;
}

interface Ticket {
  id: string;
  status: string;
  unreadMessages: number;
  lastMessage: string | null;
  isGroup: boolean;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact: ContactInfo;
  queue: { id: string; name: string; color: string } | null;
  assignee: { id: string; name: string } | null;
  /** status da conversa: ACTIVE = IA respondendo; HUMAN_TAKEOVER = pessoa; PENDING = fora do horário */
  conversation: { id: string; channel: string; status?: string; agent?: { id: string; name: string } | null };
  ticketTags?: { tagId: string; tag: { id: string; name: string; color: string } }[];
}

interface QueueCount { id: string; name: string; color: string; count: number }

interface Stats {
  pending: number;
  open: number;
  closed: number;
  total: number;
  withUnread: number;
  /** campos novos do /tickets/stats (podem faltar em servidor antigo) */
  aiActive?: number;
  waitingHuman?: number;
  mine?: number;
}

// ── Filtros rápidos (chips) ──

type FilterKey = 'all' | 'ai' | 'human' | 'mine' | 'closed';

/** Atendimentos em andamento = ticket PENDING ou OPEN. */
const IN_PROGRESS = 'PENDING,OPEN';

const FILTERS: {
  key: FilterKey;
  label: string;
  params: (userId?: string) => Record<string, string>;
  count: (s: Stats) => number | undefined;
  empty: string;
  emptyHint: string;
  icon: LucideIcon;
}[] = [
  {
    key: 'all', label: 'Todos', icon: Inbox,
    params: () => ({ status: IN_PROGRESS }),
    count: (s) => s.pending + s.open,
    empty: 'Nenhum atendimento em andamento',
    emptyHint: 'Quando um cliente mandar mensagem no WhatsApp, o atendimento aparece aqui.',
  },
  {
    key: 'ai', label: 'IA atendendo', icon: Bot,
    params: () => ({ status: IN_PROGRESS, aiStatus: 'ACTIVE' }),
    count: (s) => s.aiActive,
    empty: 'Nenhum atendimento com a IA agora',
    emptyHint: 'As conversas que a IA está respondendo sozinha aparecem aqui.',
  },
  {
    key: 'human', label: 'Aguardando humano', icon: UserRound,
    // IA parada: alguém assumiu (HUMAN_TAKEOVER) ou chegou mensagem fora do horário (PENDING)
    params: () => ({ status: IN_PROGRESS, aiStatus: 'HUMAN_TAKEOVER,PENDING' }),
    count: (s) => s.waitingHuman,
    empty: 'Ninguém esperando por uma pessoa',
    emptyHint: 'Tudo em dia! Conversas que precisam de um atendente aparecem aqui.',
  },
  {
    key: 'mine', label: 'Comigo', icon: MessageSquare,
    params: (userId): Record<string, string> => (userId ? { status: IN_PROGRESS, assignedTo: userId } : { status: IN_PROGRESS }),
    count: (s) => s.mine,
    empty: 'Nenhum atendimento com você agora',
    emptyHint: 'Os atendimentos que você aceitar ou receber aparecem aqui.',
  },
  {
    key: 'closed', label: 'Encerrados', icon: CheckCircle,
    params: () => ({ status: 'CLOSED' }),
    count: (s) => s.closed,
    empty: 'Nenhum atendimento encerrado',
    emptyHint: 'Os atendimentos que você encerrar ficam guardados aqui.',
  },
];

// ── Quem está atendendo ──

function whoIsAttending(ticket: Ticket, myId?: string): { label: string; cls: string; icon: LucideIcon } {
  if (ticket.status === 'CLOSED') {
    return { label: 'Encerrado', cls: 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]', icon: CheckCircle };
  }
  if (ticket.conversation.status === 'ACTIVE') {
    return { label: 'IA atendendo', cls: 'bg-[var(--color-success-bg)] text-[var(--color-success)]', icon: Bot };
  }
  if (ticket.assignee) {
    const name = ticket.assignee.id === myId ? 'você' : ticket.assignee.name;
    return { label: `Com ${name}`, cls: 'bg-[var(--color-info-bg)] text-[var(--color-info)]', icon: UserRound };
  }
  return { label: 'Aguardando atendente', cls: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]', icon: Clock };
}

// ── Salvar contato ──

const EMPTY_CONTACT = {
  name: '', phone: '', email: '', cpfCnpj: '', address: '', city: '',
  state: '', zipCode: '', company: '', role: '', notes: '',
};
type ContactForm = typeof EMPTY_CONTACT;

// ── Estilos (acabamento) ──

/** Só troca cor/fundo (150ms) e encolhe um pouco ao tocar; hover só em mouse/trackpad. */
const CHIP_BASE =
  'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium select-none ' +
  '[transition:background-color_150ms_ease,color_150ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)] ' +
  'active:scale-[0.97] motion-reduce:active:scale-100 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]';
const CHIP_ON = 'bg-[var(--color-primary-500)] text-white';
const CHIP_OFF =
  'bg-[var(--surface-secondary)] text-[var(--text-secondary)] ' +
  '[@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--surface-tertiary)] ' +
  '[@media(hover:hover)_and_(pointer:fine)]:hover:text-[var(--text-primary)]';

const HOVER_ROW = '[@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--surface-secondary)]';

export default function TicketsPage() {
  const { user } = useAuthStore();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Dados completos do atendimento aberto (GET /tickets/:id) — continua visível mesmo se sair do filtro. */
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);

  const [filter, setFilter] = useState<FilterKey>('all');
  const [activeQueueId, setActiveQueueId] = useState<string>('');
  const [queueCounts, setQueueCounts] = useState<QueueCount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<Stats>({ pending: 0, open: 0, closed: 0, total: 0, withUnread: 0 });

  const [showTransfer, setShowTransfer] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showSaveContact, setShowSaveContact] = useState(false);
  const [contactForm, setContactForm] = useState<ContactForm>(EMPTY_CONTACT);
  const [savingContact, setSavingContact] = useState(false);
  const [waWindow, setWaWindow] = useState<WaWindow | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const { tags, addTagToTicket, removeTagFromTicket } = useTags();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const jumpToEndRef = useRef(true);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const listRequestRef = useRef(0);
  const beepedRef = useRef<Set<string>>(new Set());
  const { playBeep } = useNotificationSound();

  const listTicket = tickets.find((t) => t.id === selectedId);
  const selectedTicket: Ticket | undefined =
    detail && detail.id === selectedId
      // a lista tem contagem de não lidas/última mensagem mais novas; o detalhe tem o contato completo
      ? { ...detail, unreadMessages: listTicket?.unreadMessages ?? detail.unreadMessages }
      : listTicket;
  const convStatus = selectedTicket?.conversation.status;
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  // ── Carregamento ──

  const fetchTickets = useCallback(async (showError = false) => {
    const requestId = ++listRequestRef.current;
    setFetching(true);
    try {
      const params = new URLSearchParams(activeFilter.params(user?.id));
      if (activeQueueId) params.set('queueId', activeQueueId);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      const { data } = await api.get(`/tickets?${params}`);
      // Só vale a resposta do pedido mais recente (troca rápida de filtro)
      if (requestId === listRequestRef.current) setTickets(data.tickets || []);
    } catch (err) {
      if (showError && requestId === listRequestRef.current) {
        toast.error(getErrorMessage(err, 'Não foi possível carregar os atendimentos.'));
      }
    } finally {
      if (requestId === listRequestRef.current) {
        setLoading(false);
        setFetching(false);
      }
    }
  }, [activeFilter, activeQueueId, searchTerm, user?.id]);

  const fetchStats = useCallback(async () => {
    try { const { data } = await api.get('/tickets/stats'); setStats((s) => ({ ...s, ...data })); } catch { /* números dos filtros: tenta de novo no próximo evento */ }
  }, []);

  const fetchQueueCounts = useCallback(async () => {
    try { const { data } = await api.get('/tickets/queue-counts'); setQueueCounts(Array.isArray(data) ? data : []); } catch { setQueueCounts([]); }
  }, []);

  const fetchDetail = useCallback(async (ticketId: string) => {
    try {
      const { data } = await api.get(`/tickets/${ticketId}`);
      if (selectedIdRef.current !== ticketId) return; // já trocou de atendimento
      const { messages: msgs, ...conversation } = data.conversation || {};
      setMessages(msgs || []);
      setDetail({ ...data, conversation });
    } catch (err) {
      if (selectedIdRef.current === ticketId) toast.error(getErrorMessage(err, 'Não foi possível carregar as mensagens.'));
    }
  }, []);

  useEffect(() => { fetchStats(); fetchQueueCounts(); }, [fetchStats, fetchQueueCounts]);
  useEffect(() => {
    const t = setTimeout(() => fetchTickets(true), searchTerm ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchTickets, searchTerm]);
  useEffect(() => {
    setAgentTyping(false);
    if (!selectedId) { setMessages([]); setDetail(null); return; }
    jumpToEndRef.current = true;
    setMessages([]);
    setLoadingMessages(true);
    fetchDetail(selectedId).finally(() => setLoadingMessages(false));
  }, [selectedId, fetchDetail]);
  // API oficial: janela de 24 h (recalcula ao abrir e a cada mensagem nova da conversa)
  const windowConvId = selectedTicket?.conversation.channel === 'WHATSAPP' ? selectedTicket.conversation.id : null;
  const fetchWindow = useCallback(async (conversationId: string | null) => {
    if (!conversationId) { setWaWindow(null); return; }
    try {
      const { data } = await api.get(`/conversations/${conversationId}/whatsapp-window`);
      setWaWindow(data);
    } catch { setWaWindow(null); }
  }, []);
  useEffect(() => { fetchWindow(windowConvId); }, [windowConvId, messages.length, fetchWindow]);

  useEffect(() => {
    // Ao abrir um atendimento, pula direto para o fim; mensagens novas rolam suave
    messagesEndRef.current?.scrollIntoView({ behavior: jumpToEndRef.current ? 'auto' : 'smooth' });
    if (messages.length > 0) jumpToEndRef.current = false;
  }, [messages, agentTyping]);

  // ── Tempo real ──
  useSocketSubscription('ticket:subscribe-status', 'ticket:unsubscribe-status', 'PENDING');
  useSocketSubscription('ticket:subscribe-status', 'ticket:unsubscribe-status', 'OPEN');
  useSocketSubscription('ticket:subscribe-status', 'ticket:unsubscribe-status', 'CLOSED');
  useSocketSubscription('ticket:subscribe', 'ticket:unsubscribe', selectedId);
  // Sala da conversa: mensagens de sistema (assumiu/devolveu/transferiu) e "IA digitando"
  useSocketSubscription('conversation:join', 'conversation:leave', selectedTicket?.conversation.id ?? null);

  // Vários eventos chegam juntos (sala do tenant + sala do status): junta tudo em uma atualização
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const refreshDetailRef = useRef(false);
  const refreshNowRef = useRef<() => void>(() => {});
  refreshNowRef.current = () => {
    fetchTickets(); fetchStats(); fetchQueueCounts();
    if (refreshDetailRef.current && selectedIdRef.current) fetchDetail(selectedIdRef.current);
    refreshDetailRef.current = false;
  };
  /** withDetail: recarrega também o atendimento aberto (status/atendente mudaram). */
  const scheduleRefresh = useCallback((withDetail = false) => {
    if (withDetail) refreshDetailRef.current = true;
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => refreshNowRef.current(), 250);
  }, []);
  useEffect(() => () => clearTimeout(refreshTimerRef.current), []);

  useSocketEvent('ticket:create', () => scheduleRefresh());
  useSocketEvent('ticket:update', () => scheduleRefresh(true));
  useSocketEvent('ticket:delete', () => scheduleRefresh());
  useSocketEvent('ticket:assign', () => { scheduleRefresh(true); toast.info('Um atendimento foi direcionado para você.'); });
  useSocketEvent<{ conversation?: { id: string; status?: string } }>('conversation:updated', (data) => {
    const conv = data?.conversation;
    if (conv?.status && detail && conv.id === detail.conversation.id) {
      setDetail((d) => (d ? { ...d, conversation: { ...d.conversation, status: conv.status } } : d));
    }
    scheduleRefresh();
  });
  useSocketEvent<{ conversationId: string; message: ChatMessage }>('message:new', (data) => {
    if (!data?.message) return;
    const isSelected = !!selectedTicket && data.conversationId === selectedTicket.conversation.id;
    if (isSelected) {
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      if (data.message.role !== 'USER') setAgentTyping(false);
    }
    // A mesma mensagem chega por mais de uma sala: toca o aviso uma vez só
    if (data.message.role === 'USER' && !beepedRef.current.has(data.message.id)) {
      beepedRef.current.add(data.message.id);
      if (beepedRef.current.size > 200) beepedRef.current = new Set([data.message.id]);
      playBeep();
      if (isSelected && selectedId) api.post(`/tickets/${selectedId}/read`).catch(() => { /* opcional */ });
    }
    scheduleRefresh();
  });
  useSocketEvent<{ conversationId: string }>('agent:typing', (data) => {
    if (selectedTicket && data?.conversationId === selectedTicket.conversation.id) setAgentTyping(true);
  });
  useSocketEvent<{ conversationId: string }>('agent:stopped-typing', (data) => {
    if (selectedTicket && data?.conversationId === selectedTicket.conversation.id) setAgentTyping(false);
  });

  // ── Ações ──

  async function act(fn: () => Promise<unknown>, success: string, fallback: string) {
    try {
      await fn();
      toast.success(success);
      fetchTickets(); fetchStats(); fetchQueueCounts();
      if (selectedId) fetchDetail(selectedId);
    } catch (err) {
      toast.error(getErrorMessage(err, fallback));
    }
  }

  const handleAccept = () => selectedId && act(() => api.post(`/tickets/${selectedId}/accept`), 'Atendimento aceito. Agora é com você!', 'Não foi possível aceitar.');
  const handleReopen = () => selectedId && act(() => api.post(`/tickets/${selectedId}/reopen`), 'Atendimento reaberto.', 'Não foi possível reabrir.');

  async function handleClose() {
    if (!selectedId) return;
    const ok = await askConfirm({
      title: 'Encerrar este atendimento?',
      description: 'Use quando o assunto estiver resolvido. Se o cliente escrever de novo, o atendimento volta para a lista.',
      confirmLabel: 'Encerrar',
    });
    if (ok) act(() => api.post(`/tickets/${selectedId}/close`), 'Atendimento encerrado.', 'Não foi possível encerrar.');
  }

  const handleEscalate = () => selectedTicket && act(
    () => api.post(`/conversations/${selectedTicket.conversation.id}/escalate`),
    'Você assumiu a conversa. A IA parou de responder.', 'Não foi possível assumir a conversa.');

  const handleReturnToAgent = () => selectedTicket && act(
    () => api.post(`/conversations/${selectedTicket.conversation.id}/return-to-agent`),
    'Conversa devolvida para a IA.', 'Não foi possível devolver para a IA.');

  function setConversationStatus(status: string) {
    setDetail((d) => (d ? { ...d, conversation: { ...d.conversation, status } } : d));
  }

  async function ensureHumanMode(ticket: Ticket) {
    if (ticket.conversation.status === 'ACTIVE') {
      await api.post(`/conversations/${ticket.conversation.id}/escalate`);
      setConversationStatus('HUMAN_TAKEOVER');
    }
  }

  async function handleSendText(text: string): Promise<boolean> {
    if (!selectedTicket) return false;
    try {
      await ensureHumanMode(selectedTicket);
      await api.post(`/conversations/${selectedTicket.conversation.id}/messages`, { content: text, role: 'ASSISTANT' });
      await fetchDetail(selectedTicket.id);
      fetchTickets(); fetchStats();
      return true;
    } catch (err) {
      const msg = getErrorMessage(err, 'Não foi possível enviar a mensagem.');
      toast.error(msg);
      // Fora da janela de 24 h (API oficial): oferece o modelo aprovado
      if (/janela de 24h/i.test(msg)) { fetchWindow(selectedTicket.conversation.id); setShowTemplates(true); }
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
      await fetchDetail(selectedTicket.id);
      fetchTickets(); fetchStats();
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
      fetchTickets(); fetchStats();
      fetchDetail(selectedTicket.id);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível transferir.'));
    }
  }

  async function handleAddNote(content: string): Promise<boolean> {
    if (!selectedTicket || !content) return false;
    try {
      await api.post(`/conversations/${selectedTicket.conversation.id}/note`, { content });
      toast.success('Nota salva.');
      fetchDetail(selectedTicket.id);
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
      fetchTickets(); fetchDetail(selectedId);
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
      fetchTickets(); fetchDetail(selectedId);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível remover a etiqueta.'));
    }
  }

  // ── Salvar contato ──

  function openSaveContactModal(contact: ContactInfo) {
    setContactForm({
      name: contact.name || '',
      phone: contact.phone ? maskPhone(contact.phone) : '',
      email: contact.email || '',
      cpfCnpj: contact.cpfCnpj || '',
      address: contact.address || '',
      city: contact.city || '',
      state: contact.state || '',
      zipCode: contact.zipCode || '',
      company: contact.company || '',
      role: contact.role || '',
      notes: contact.notes || '',
    });
    setShowSaveContact(true);
  }

  function setField(field: keyof ContactForm, value: string) {
    let masked = value;
    if (field === 'cpfCnpj') masked = maskCPFCNPJ(value);
    else if (field === 'zipCode') masked = maskCEP(value);
    else if (field === 'state') masked = value.toUpperCase();
    setContactForm((f) => ({ ...f, [field]: masked }));
  }

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault();
    const contactId = selectedTicket?.contact.id;
    if (!contactId || !contactForm.name.trim()) return;
    setSavingContact(true);
    try {
      // O telefone vem do WhatsApp e não muda aqui; o resto vai para a ficha do contato
      const { name, email, cpfCnpj, address, city, state, zipCode, company, role, notes } = contactForm;
      await api.patch(`/contacts/${contactId}`, {
        name: name.trim(), email: email.trim(), cpfCnpj, address, city, state, zipCode, company, role, notes,
      });
      setShowSaveContact(false);
      toast.success(`Contato "${contactForm.name.trim()}" salvo!`);
      fetchTickets();
      if (selectedId) fetchDetail(selectedId);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar o contato.'));
    } finally {
      setSavingContact(false);
    }
  }

  // ── Tela ──

  const actionBtn = `flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-color)] [transition:background-color_150ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:active:scale-100 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--surface-tertiary)]`;
  const isClosed = selectedTicket?.status === 'CLOSED';
  const isAiActive = convStatus === 'ACTIVE';
  const isHuman = convStatus === 'HUMAN_TAKEOVER';
  const EmptyIcon = activeFilter.icon;
  const trimmedSearch = searchTerm.trim();

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] lg:h-[calc(100dvh-5.5rem)] rounded-xl overflow-hidden border border-[var(--border-color)]">
      {/* Lista */}
      <div className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 md:border-r border-[var(--border-color)] bg-[var(--surface-primary)] flex-col`}>
        <div className="p-3 border-b border-[var(--border-color)] space-y-2.5">
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">Atendimentos</h1>
            {stats.withUnread > 0 && (
              <span className="text-xs text-[var(--text-secondary)]">{stats.withUnread} com mensagem nova</span>
            )}
          </div>

          <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrar atendimentos">
            {FILTERS.map((f) => {
              const on = filter === f.key;
              const count = f.count(stats);
              return (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={on}
                  className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}>
                  {f.label}
                  {count !== undefined && (
                    <span className={`tabular-nums text-[11px] leading-none px-1.5 py-0.5 rounded-full ${on ? 'bg-white/20' : 'bg-[var(--surface-primary)]'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar contato ou mensagem..." aria-label="Buscar atendimentos"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
            </div>
            {queueCounts.length > 0 && (
              <select value={activeQueueId} onChange={(e) => setActiveQueueId(e.target.value)} aria-label="Filtrar por fila"
                className="w-32 shrink-0 px-2 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none">
                <option value="">Todas as filas</option>
                {queueCounts.map((q) => (
                  <option key={q.id} value={q.id}>{q.name} ({q.count})</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto [transition:opacity_150ms_ease] ${fetching && !loading ? 'opacity-60' : 'opacity-100'}`} aria-busy={fetching}>
          {loading ? (
            <div className="p-4 text-center text-sm text-[var(--text-tertiary)]">Carregando...</div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 py-10 text-center">
              <EmptyIcon size={36} className="text-[var(--text-tertiary)] mb-3" />
              {trimmedSearch ? (
                <>
                  <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-1">Nada encontrado</h2>
                  <p className="text-xs text-[var(--text-tertiary)] leading-relaxed max-w-[240px]">
                    Nenhum atendimento com "{trimmedSearch}" em "{activeFilter.label}".
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-1">{activeFilter.empty}</h2>
                  <p className="text-xs text-[var(--text-tertiary)] leading-relaxed max-w-[240px]">
                    {activeQueueId ? 'Nenhum atendimento nesta fila. Tente "Todas as filas".' : activeFilter.emptyHint}
                  </p>
                </>
              )}
            </div>
          ) : (
            tickets.map((ticket) => {
              const who = whoIsAttending(ticket, user?.id);
              const WhoIcon = who.icon;
              const isSelected = selectedId === ticket.id;
              return (
                <button key={ticket.id} type="button" onClick={() => selectTicket(ticket.id)} aria-current={isSelected || undefined}
                  className={`w-full text-left p-3 border-b border-[var(--border-color)] [transition:background-color_150ms_ease] ${
                    isSelected ? 'bg-[var(--color-primary-50)] border-l-2 border-l-[var(--color-primary-500)]' : HOVER_ROW
                  }`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--surface-tertiary)] flex items-center justify-center shrink-0 text-sm font-medium text-[var(--text-secondary)]">
                      {(ticket.contact.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-[var(--text-primary)] truncate">{ticket.contact.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
                            {ticket.conversation.channel === 'WHATSAPP' ? <Phone size={10} className="inline mr-0.5" /> : null}
                            {new Date(ticket.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {ticket.unreadMessages > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--color-primary-500)] text-white tabular-nums" aria-label={`${ticket.unreadMessages} não lidas`}>{ticket.unreadMessages}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{ticket.lastMessage || 'Sem mensagem'}</p>
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${who.cls}`}>
                          <WhoIcon size={11} /> {who.label}
                        </span>
                        {ticket.queue && (
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ticket.queue.color }} />
                            {ticket.queue.name}
                          </span>
                        )}
                        {ticket.ticketTags?.map((tt) => (
                          <span key={tt.tagId} className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: tt.tag.color }}>{tt.tag.name}</span>
                        ))}
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
                    {!isClosed && isAiActive && (
                      <span className="text-[var(--color-success)]"> · IA atendendo{selectedTicket.conversation.agent ? `: ${selectedTicket.conversation.agent.name}` : ''}</span>
                    )}
                    {!isClosed && !isAiActive && selectedTicket.assignee && (
                      <span className="text-[var(--color-info)]"> · Atendente: {selectedTicket.assignee.id === user?.id ? 'você' : selectedTicket.assignee.name}</span>
                    )}
                    {!isClosed && !isAiActive && !selectedTicket.assignee && (
                      <span className="text-[var(--color-warning)]"> · Aguardando atendente</span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {selectedTicket.ticketTags?.map((tt) => (
                      <button key={tt.tagId} type="button" onClick={() => handleRemoveTag(tt.tagId)}
                        className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: tt.tag.color }}
                        title="Remover etiqueta" aria-label={`Remover etiqueta ${tt.tag.name}`}>
                        {tt.tag.name} <X size={10} />
                      </button>
                    ))}
                    <button onClick={() => setShowTagModal(true)} className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--surface-tertiary)] text-[var(--text-secondary)] hover:opacity-80 transition-opacity" aria-label="Adicionar etiqueta">
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
                {isAiActive && !isClosed && (
                  <button onClick={handleEscalate} className={`${actionBtn} text-[var(--color-warning)]`}>
                    <ArrowUpRight size={14} /> Assumir conversa
                  </button>
                )}
                {isHuman && !isClosed && (
                  <button onClick={handleReturnToAgent} className={`${actionBtn} text-[var(--color-info)]`}>
                    <ArrowDownLeft size={14} /> Devolver para a IA
                  </button>
                )}
                {!isClosed && (selectedTicket.status === 'OPEN' || isHuman) && (
                  <button onClick={() => setShowTransfer(true)} className={`${actionBtn} text-[var(--text-primary)]`}>
                    <ArrowLeftRight size={14} /> Transferir
                  </button>
                )}
                <button onClick={() => setShowNote(true)} className={`${actionBtn} text-[var(--text-primary)]`}>
                  <StickyNote size={14} /> Nota
                </button>
                <button onClick={() => openSaveContactModal(selectedTicket.contact)} className={`${actionBtn} text-[var(--color-primary-500)]`}>
                  <Save size={14} /> Salvar contato
                </button>
                {!isClosed && (
                  <button onClick={handleClose} className={`${actionBtn} text-[var(--text-secondary)]`} title="Marcar como resolvido">
                    <CheckCircle size={14} /> Encerrar
                  </button>
                )}
                {isClosed && (
                  <button onClick={handleReopen} className={`${actionBtn} text-[var(--color-info)]`}>
                    <ArrowDownLeft size={14} /> Reabrir
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3">
              {loadingMessages && messages.length === 0 && (
                <p className="text-center text-sm text-[var(--text-tertiary)]">Carregando mensagens...</p>
              )}
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} humanMode={isHuman} />
              ))}
              {agentTyping && (
                <div className="flex justify-end">
                  <div className="bg-[var(--surface-primary)] border border-[var(--border-color)] rounded-2xl px-4 py-2.5 text-sm text-[var(--text-tertiary)]">
                    <Bot size={12} className="inline mr-1 animate-pulse motion-reduce:animate-none" /> IA digitando...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {isClosed ? (
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
                {waWindow?.provider === 'CLOUD_API' && !waWindow.insideWindow ? (
                  <div className="bg-[var(--surface-primary)] border-t border-[var(--border-color)] p-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-[var(--text-secondary)]">
                      <strong className="text-[var(--color-warning)]">Fora da janela de 24h — use um modelo aprovado.</strong>{' '}
                      O cliente não fala com você há mais de 24 horas; a Meta só permite modelos aprovados até ele responder.
                    </p>
                    <Button size="sm" onClick={() => setShowTemplates(true)}>Enviar modelo aprovado</Button>
                  </div>
                ) : (
                  <>
                    {waWindow?.provider === 'CLOUD_API' && waWindow.windowEndsAt && (
                      <p className="bg-[var(--surface-primary)] border-t border-[var(--border-color)] px-4 pt-2 text-xs text-[var(--text-tertiary)]">
                        API oficial: você pode responder livremente até {new Date(waWindow.windowEndsAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.
                      </p>
                    )}
                    <ChatComposer onSendText={handleSendText} onSendFile={handleSendFile} />
                  </>
                )}
                {windowConvId && (
                  <TemplatePickerModal
                    open={showTemplates}
                    conversationId={windowConvId}
                    contactName={selectedTicket.contact.name}
                    onClose={() => setShowTemplates(false)}
                    onSent={() => { fetchDetail(selectedTicket.id); fetchTickets(); fetchStats(); }}
                  />
                )}
              </>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)] px-6">
            <div className="text-center">
              <Inbox size={48} className="mx-auto mb-3" />
              <p className="text-[var(--text-secondary)]">Selecione um atendimento</p>
              <p className="text-xs mt-1">Escolha uma conversa na lista para ver as mensagens e responder.</p>
            </div>
          </div>
        )}
      </div>

      <TransferModal open={showTransfer} onClose={() => setShowTransfer(false)} onConfirm={handleTransfer} excludeUserId={user?.id} />
      <NoteModal open={showNote} onClose={() => setShowNote(false)} onSave={handleAddNote} />

      <Modal open={showSaveContact} onClose={() => setShowSaveContact(false)} title="Salvar contato"
        description="Complete os dados do cliente. Eles ficam guardados na tela Contatos." size="lg">
        <form onSubmit={handleSaveContact} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Nome *" required value={contactForm.name} onChange={(e) => setField('name', e.target.value)} placeholder="Nome do contato" />
            <Input label="Telefone (do WhatsApp)" value={contactForm.phone} disabled readOnly />
          </div>
          <Input label="E-mail" type="email" value={contactForm.email} onChange={(e) => setField('email', e.target.value)} placeholder="email@exemplo.com" />
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="CPF/CNPJ" value={contactForm.cpfCnpj} onChange={(e) => setField('cpfCnpj', e.target.value)} placeholder="000.000.000-00" />
            <Input label="CEP" value={contactForm.zipCode} onChange={(e) => setField('zipCode', e.target.value)} placeholder="00000-000" />
          </div>
          <Input label="Endereço" value={contactForm.address} onChange={(e) => setField('address', e.target.value)} placeholder="Rua, número, bairro" />
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Cidade" value={contactForm.city} onChange={(e) => setField('city', e.target.value)} placeholder="São Paulo" />
            <Input label="Estado" value={contactForm.state} onChange={(e) => setField('state', e.target.value)} placeholder="SP" maxLength={2} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Empresa" value={contactForm.company} onChange={(e) => setField('company', e.target.value)} placeholder="Nome da empresa" />
            <Input label="Cargo" value={contactForm.role} onChange={(e) => setField('role', e.target.value)} placeholder="Cargo do contato" />
          </div>
          <div>
            <label htmlFor="contact-notes" className="block text-sm font-medium text-[var(--text-primary)] mb-1">Observações</label>
            <textarea id="contact-notes" value={contactForm.notes} onChange={(e) => setField('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
              placeholder="Informações adicionais..." />
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--border-color)]">
            <Button type="button" variant="secondary" onClick={() => setShowSaveContact(false)}>Cancelar</Button>
            <Button type="submit" loading={savingContact}>{!savingContact && <Save size={14} />} Salvar contato</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showTagModal} onClose={() => setShowTagModal(false)} title="Adicionar etiqueta" size="sm">
        {tags.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] text-center py-4">
            Nenhuma etiqueta criada ainda. Crie etiquetas em "Respostas e etiquetas".
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {tags.map((tag) => {
              const alreadyAdded = selectedTicket?.ticketTags?.some((tt) => tt.tagId === tag.id);
              return (
                <button key={tag.id} type="button" disabled={alreadyAdded} onClick={() => handleAddTag(tag.id)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-[var(--border-color)] transition-colors flex items-center justify-between hover:bg-[var(--surface-secondary)] disabled:opacity-60 disabled:hover:bg-transparent">
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
