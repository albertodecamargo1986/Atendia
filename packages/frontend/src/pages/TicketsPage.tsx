import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { io as socketIO, Socket } from 'socket.io-client';
import {
  MessageSquare, Send, CheckCircle, Bot, ArrowDownLeft,
  ArrowLeftRight, StickyNote, X, Users, Search, Filter,
  Phone, Clock, ChevronRight, Inbox, Paperclip, Zap, FileText, Tag, Plus
} from 'lucide-react';
import { useNotificationSound } from '../hooks/useNotificationSound';
import { useQuickReplies } from '../hooks/useQuickReplies';
import { useTags } from '../hooks/useTags';

interface Contact {
  id: string;
  name: string;
  phone: string;
  profilePicUrl?: string;
}

interface Queue {
  id: string;
  name: string;
  color: string;
}

interface Assignee {
  id: string;
  name: string;
}

interface ConversationInfo {
  id: string;
  channel: string;
  agent?: { id: string; name: string };
}

interface TicketTagData {
  tagId: string;
  tag: { id: string; name: string; color: string };
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
  contact: Contact;
  queue: Queue | null;
  assignee: Assignee | null;
  conversation: ConversationInfo;
  ticketTags?: TicketTagData[];
}

interface Message {
  id: string;
  role: string;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  metadata?: any;
  createdAt: string;
}

interface QueueCount {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Pendente', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  OPEN: { label: 'Atendimento', color: 'text-green-700', bg: 'bg-green-100' },
  CLOSED: { label: 'Fechado', color: 'text-gray-600', bg: 'bg-gray-100' },
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Filters
  const [activeStatus, setActiveStatus] = useState<string>('PENDING');
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
  const [queueCounts, setQueueCounts] = useState<QueueCount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Stats
  const [stats, setStats] = useState({ pending: 0, open: 0, closed: 0, total: 0, withUnread: 0 });

  // Modals
  const [showTransfer, setShowTransfer] = useState(false);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [transferTarget, setTransferTarget] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [showTagModal, setShowTagModal] = useState(false);

  // Quick replies & tags
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const { replies } = useQuickReplies();
  const { tags, addTagToTicket, removeTagFromTicket } = useTags();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { playBeep } = useNotificationSound();

  // --- Socket setup ---
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const wsUrl = import.meta.env.VITE_WS_URL || (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws') : '');
  if (!wsUrl) return;
  const s = socketIO(wsUrl, {
      auth: { token },
      transports: ['websocket'],
    });

    s.on('connect', () => {
      s.emit('ticket:subscribe-status', 'PENDING');
      s.emit('ticket:subscribe-status', 'OPEN');
      s.emit('ticket:subscribe-status', 'CLOSED');
    });

    s.on('ticket:create', () => { fetchTickets(); fetchStats(); fetchQueueCounts(); });
    s.on('ticket:update', () => { fetchTickets(); fetchStats(); });
    s.on('ticket:delete', () => { fetchTickets(); fetchStats(); });
    s.on('ticket:assign', () => { fetchTickets(); fetchStats(); });

    s.on('message:new', (data: { conversationId: string; message: Message }) => {
      const selected = tickets.find(t => t.id === selectedId);
      if (selected && data.conversationId === selected.conversation.id) {
        setMessages(prev => [...prev, data.message]);
      }
      playBeep();
    });

    setSocket(s);
    return () => { s.disconnect(); };
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchMessages(selectedId);
      socket?.emit('ticket:subscribe', selectedId);
    }
    return () => {
      if (selectedId) socket?.emit('ticket:unsubscribe', selectedId);
    };
  }, [selectedId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { fetchTickets(); }, [activeStatus, activeQueueId, searchTerm]);

  // --- Fetch functions ---
  async function fetchTickets() {
    try {
      const params = new URLSearchParams();
      params.set('status', activeStatus);
      if (activeQueueId) params.set('queueId', activeQueueId);
      if (searchTerm) params.set('search', searchTerm);
      const { data } = await api.get(`/tickets?${params}`);
      setTickets(data.tickets || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function fetchStats() {
    try { const { data } = await api.get('/tickets/stats'); setStats(data); } catch { /* ignore */ }
  }

  async function fetchQueueCounts() {
    try { const { data } = await api.get('/tickets/queue-counts'); setQueueCounts(data); } catch { /* ignore */ }
  }

  async function fetchMessages(ticketId: string) {
    try {
      const { data } = await api.get(`/tickets/${ticketId}`);
      setMessages(data.conversation?.messages || []);
    } catch { /* ignore */ }
  }

  // --- Actions ---
  async function handleAccept() {
    if (!selectedId) return;
    try { await api.post(`/tickets/${selectedId}/accept`); fetchTickets(); fetchStats(); } catch { /* ignore */ }
  }

  async function handleClose() {
    if (!selectedId) return;
    try { await api.post(`/tickets/${selectedId}/close`); fetchTickets(); fetchStats(); } catch { /* ignore */ }
  }

  async function handleReopen() {
    if (!selectedId) return;
    try { await api.post(`/tickets/${selectedId}/reopen`); fetchTickets(); fetchStats(); } catch { /* ignore */ }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedId) return;
    const ticket = tickets.find(t => t.id === selectedId);
    if (!ticket) return;
    try {
      await api.post(`/conversations/${ticket.conversation.id}/messages`, { content: newMessage, role: 'USER' });
      setNewMessage('');
    } catch { /* ignore */ }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    const ticket = tickets.find(t => t.id === selectedId);
    if (!ticket) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data: upload } = await api.post('/media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await api.post(`/conversations/${ticket.conversation.id}/messages`, {
        content: file.name,
        role: 'USER',
        mediaUrl: upload.mediaUrl,
        mediaType: upload.mediaType,
      });
    } catch { /* ignore */ }
    finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
  }

  async function handleEscalate() {
    if (!selectedId) return;
    const ticket = tickets.find(t => t.id === selectedId);
    if (!ticket) return;
    try { await api.post(`/conversations/${ticket.conversation.id}/escalate`); fetchTickets(); } catch { /* ignore */ }
  }

  async function handleResolve() {
    if (!selectedId) return;
    const ticket = tickets.find(t => t.id === selectedId);
    if (!ticket) return;
    try { await api.post(`/conversations/${ticket.conversation.id}/resolve`); fetchTickets(); fetchStats(); } catch { /* ignore */ }
  }

  async function handleReturnToAgent() {
    if (!selectedId) return;
    const ticket = tickets.find(t => t.id === selectedId);
    if (!ticket) return;
    try { await api.post(`/conversations/${ticket.conversation.id}/return-to-agent`); fetchTickets(); fetchMessages(selectedId); } catch { /* ignore */ }
  }

  async function handleTransfer() {
    if (!selectedId || !transferTarget) return;
    const ticket = tickets.find(t => t.id === selectedId);
    if (!ticket) return;
    try {
      await api.post(`/conversations/${ticket.conversation.id}/transfer`, { toUserId: transferTarget });
      setShowTransfer(false);
      setTransferTarget('');
      fetchTickets();
      fetchMessages(selectedId);
    } catch { /* ignore */ }
  }

  async function openTransferModal() {
    try {
      const { data } = await api.get('/users');
      setTeamUsers(data.filter((u: TeamUser) => u.isActive));
      setShowTransfer(true);
    } catch { /* ignore */ }
  }

  async function handleAddNote() {
    if (!selectedId || !noteContent.trim()) return;
    const ticket = tickets.find(t => t.id === selectedId);
    if (!ticket) return;
    try {
      await api.post(`/conversations/${ticket.conversation.id}/note`, { content: noteContent });
      setShowNote(false);
      setNoteContent('');
      fetchMessages(selectedId);
    } catch { /* ignore */ }
  }

  async function handleMarkRead(ticketId: string) {
    try { await api.post(`/tickets/${ticketId}/read`); fetchTickets(); } catch { /* ignore */ }
  }

  async function handleAddTag(tagId: string) {
    if (!selectedId) return;
    await addTagToTicket(selectedId, tagId);
    fetchTickets();
    setShowTagModal(false);
  }

  async function handleRemoveTag(tagId: string) {
    if (!selectedId) return;
    await removeTagFromTicket(selectedId, tagId);
    fetchTickets();
  }

  function insertQuickReply(content: string) {
    setNewMessage(content);
    setShowQuickReplies(false);
  }

  function renderMedia(msg: Message) {
    if (!msg.mediaUrl) return null;
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const fullUrl = msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${baseUrl}${msg.mediaUrl}`;
    if (msg.mediaType === 'IMAGE') return <img src={fullUrl} alt="" className="max-w-[240px] rounded-lg mt-1" />;
    if (msg.mediaType === 'AUDIO') return <audio controls src={fullUrl} className="mt-1 max-w-[240px]" />;
    if (msg.mediaType === 'VIDEO') return <video controls src={fullUrl} className="mt-1 max-w-[240px] rounded-lg" />;
    return <a href={fullUrl} target="_blank" rel="noopener" className="flex items-center gap-1 text-xs text-indigo-500 underline mt-1"><FileText size={12} /> {msg.content}</a>;
  }

  const selectedTicket = tickets.find(t => t.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-5rem)]">
      {/* LEFT: Queues + Status Filters */}
      <div className="w-56 border-r border-gray-200 bg-white flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Filas</h2>
        </div>
        <div className="p-2 space-y-0.5">
          <button onClick={() => { setActiveQueueId(null); setActiveStatus('PENDING'); }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${!activeQueueId && activeStatus === 'PENDING' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="flex items-center gap-2"><Inbox size={16} /> Pendentes</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${stats.pending > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>{stats.pending}</span>
          </button>
          <button onClick={() => { setActiveQueueId(null); setActiveStatus('OPEN'); }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${!activeQueueId && activeStatus === 'OPEN' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="flex items-center gap-2"><MessageSquare size={16} /> Em Atendimento</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{stats.open}</span>
          </button>
          <button onClick={() => { setActiveQueueId(null); setActiveStatus('CLOSED'); }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${!activeQueueId && activeStatus === 'CLOSED' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="flex items-center gap-2"><CheckCircle size={16} /> Fechados</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{stats.closed}</span>
          </button>
        </div>

        {queueCounts.length > 0 && (
          <>
            <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase">Por Fila</div>
            <div className="px-2 pb-2 space-y-0.5">
              {queueCounts.map(q => (
                <button key={q.id} onClick={() => { setActiveQueueId(q.id); setActiveStatus('PENDING'); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${activeQueueId === q.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: q.color }} />
                    {q.name}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{q.count}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-auto p-3 border-t border-gray-200">
          <button onClick={() => { setActiveQueueId(null); setActiveStatus('PENDING'); }}
            className="text-xs text-indigo-600 hover:text-indigo-700">
            {stats.withUnread} com nao lidas
          </button>
        </div>
      </div>

      {/* CENTER: Ticket List */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar contato ou mensagem..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-400">Carregando...</div>
          ) : tickets.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400">Nenhum ticket nesta fila</div>
          ) : (
            tickets.map((ticket) => {
              const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.PENDING;
              return (
                <button key={ticket.id} onClick={() => { setSelectedId(ticket.id); handleMarkRead(ticket.id); }}
                  className={`w-full text-left p-3 border-b border-gray-100 hover:bg-gray-50 transition ${
                    selectedId === ticket.id ? 'bg-indigo-50 border-l-2 border-l-indigo-600' : ''
                  }`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0 text-sm font-medium text-gray-600">
                      {ticket.contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-gray-900 truncate">{ticket.contact.name}</span>
                        <div className="flex items-center gap-1">
                          {ticket.unreadMessages > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-600 text-white">{ticket.unreadMessages}</span>
                          )}
                          {ticket.queue && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ticket.queue.color }} />}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{ticket.lastMessage || 'Sem mensagem'}</p>
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>{sc.label}</span>
                        {ticket.ticketTags?.map(tt => (
                          <span key={tt.tagId} className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: tt.tag.color }}>{tt.tag.name}</span>
                        ))}
                        <span className="text-xs text-gray-400">
                          {ticket.conversation.channel === 'WHATSAPP' ? <Phone size={10} className="inline" /> : null}
                          {' '}{new Date(ticket.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {ticket.assignee && <span className="text-xs text-gray-400">· {ticket.assignee.name}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT: Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedTicket ? (
          <>
            {/* Chat header */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{selectedTicket.contact.name}</h3>
                <p className="text-xs text-gray-400">
                  {selectedTicket.conversation.channel} · {selectedTicket.contact.phone}
                  {selectedTicket.queue && <span> · Fila: {selectedTicket.queue.name}</span>}
                  {selectedTicket.assignee && <span className="text-indigo-500"> · {selectedTicket.assignee.name}</span>}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {selectedTicket.ticketTags?.map(tt => (
                    <span key={tt.tagId} className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full text-white cursor-pointer" style={{ backgroundColor: tt.tag.color }} onClick={() => handleRemoveTag(tt.tagId)} title="Clique para remover">
                      {tt.tag.name} <X size={10} />
                    </span>
                  ))}
                  <button onClick={() => setShowTagModal(true)} className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition" title="Adicionar tag">
                    <Plus size={10} className="inline" /> tag
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedTicket.status === 'PENDING' && (
                  <button onClick={handleAccept} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition">
                    <CheckCircle size={14} /> Aceitar
                  </button>
                )}
                {selectedTicket.status === 'OPEN' && (
                  <>
                    <button onClick={handleClose} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition">
                      <CheckCircle size={14} /> Fechar
                    </button>
                    <button onClick={openTransferModal} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                      <ArrowLeftRight size={14} /> Transferir
                    </button>
                    <button onClick={() => setShowNote(true)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-yellow-600 bg-yellow-50 hover:bg-yellow-100 rounded-lg transition">
                      <StickyNote size={14} /> Nota
                    </button>
                  </>
                )}
                {selectedTicket.status === 'CLOSED' && (
                  <button onClick={handleReopen} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition">
                    <ArrowDownLeft size={14} /> Reabrir
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {messages.map((msg) => {
                const isInternalNote = msg.metadata?.isInternalNote;
                return (
                  <div key={msg.id} className={`flex ${
                    msg.role === 'USER' ? 'justify-end' : msg.role === 'ASSISTANT' ? 'justify-start' : 'justify-center'
                  }`}>
                    {isInternalNote ? (
                      <div className="max-w-[70%] px-4 py-2.5 rounded-2xl text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 border-l-4 border-l-yellow-500">
                        <StickyNote size={12} className="inline mr-1" />{msg.content.replace('[Nota Interna] ', '')}
                        <div className="text-xs mt-1 text-yellow-500">
                          {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ) : msg.role === 'SYSTEM' ? (
                      <div className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{msg.content}</div>
                    ) : (
                      <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${
                        msg.role === 'USER'
                          ? 'bg-indigo-600 text-white rounded-br-md'
                          : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md'
                      }`}>
                        {msg.role === 'ASSISTANT' && <Bot size={12} className="inline mr-1 text-indigo-500" />}
                        {msg.mediaUrl ? (
                          <>
                            {renderMedia(msg)}
                            {msg.content !== msg.mediaUrl.split('/').pop() && <p>{msg.content}</p>}
                          </>
                        ) : msg.content}
                        <div className={`text-xs mt-1 ${msg.role === 'USER' ? 'text-indigo-200' : 'text-gray-400'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="bg-white border-t border-gray-200 p-4">
              <div className="flex gap-2 items-end">
                <div className="flex gap-1">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition" title="Anexar arquivo">
                    <Paperclip size={18} />
                  </button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />
                  <div className="relative">
                    <button type="button" onClick={() => setShowQuickReplies(!showQuickReplies)} className="p-2.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-amber-600 transition" title="Respostas rápidas">
                      <Zap size={18} />
                    </button>
                    {showQuickReplies && replies.length > 0 && (
                      <div className="absolute bottom-12 left-0 w-64 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                        <div className="p-2 border-b border-gray-100 text-xs font-semibold text-gray-500">Respostas Rápidas</div>
                        {replies.map((r) => (
                          <button key={r.id} type="button" onClick={() => insertQuickReply(r.content)} className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition text-sm border-b border-gray-50">
                            <span className="font-mono text-xs text-indigo-500 bg-indigo-50 px-1 rounded">/{r.shortcode}</span>
                            <p className="text-gray-700 text-xs mt-0.5 truncate">{r.content}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition"
                  placeholder="Digite uma mensagem..." />
                <button type="submit" disabled={!newMessage.trim()}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50">
                  <Send size={18} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Inbox size={48} className="mx-auto mb-3 text-gray-300" />
              <p>Selecione um ticket</p>
            </div>
          </div>
        )}
      </div>

      {/* Transfer Modal */}
      {showTransfer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowTransfer(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Transferir Ticket</h2>
                <button onClick={() => setShowTransfer(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={20} /></button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {teamUsers.map((user) => (
                  <button key={user.id} onClick={() => setTransferTarget(user.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition ${transferTarget === user.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center"><Users size={14} className="text-indigo-600" /></div>
                      <div>
                        <p className="font-medium text-sm text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-400">{user.email} · {user.role}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button onClick={() => setShowTransfer(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancelar</button>
                <button onClick={handleTransfer} disabled={!transferTarget}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">Transferir</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {showNote && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowNote(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Nota Interna</h2>
                <button onClick={() => setShowNote(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={20} /></button>
              </div>
              <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} rows={4}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none text-sm"
                placeholder="Adicione uma nota visivel apenas para a equipe..." />
              <div className="flex gap-2 justify-end mt-4">
                <button onClick={() => setShowNote(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancelar</button>
                <button onClick={handleAddNote} disabled={!noteContent.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition">Salvar Nota</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tag Modal */}
      {showTagModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowTagModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Adicionar Tag</h2>
                <button onClick={() => setShowTagModal(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={20} /></button>
              </div>
              {tags.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhuma tag criada. Crie tags nas Configuracoes.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {tags.map((tag) => {
                    const alreadyAdded = selectedTicket?.ticketTags?.some(tt => tt.tagId === tag.id);
                    return (
                      <button key={tag.id} onClick={() => !alreadyAdded && handleAddTag(tag.id)}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition flex items-center justify-between ${
                          alreadyAdded ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 hover:bg-gray-50'
                        }`}>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full" style={{ backgroundColor: tag.color }} />
                          <span className="font-medium text-sm text-gray-900">{tag.name}</span>
                        </div>
                        {alreadyAdded && <span className="text-xs text-gray-400">Ja adicionada</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
