import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { io as socketIO, Socket } from 'socket.io-client';
import { MessageSquare, Send, ArrowUpRight, CheckCircle, Bot, ArrowDownLeft, ArrowLeftRight, StickyNote, X, Users, Paperclip, Zap, Image, FileText, AlertCircle, Mic, Save, Building2, Briefcase, ShieldCheck, Loader2 } from 'lucide-react';
import { useNotificationSound } from '../hooks/useNotificationSound';
import { useQuickReplies } from '../hooks/useQuickReplies';
import { maskPhone, maskCPFCNPJ, maskCEP } from '../lib/masks';

interface Conversation {
  id: string;
  channel: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  status: string;
  agent?: { id: string; name: string };
  operator?: { id: string; name: string };
  _count?: { messages: number };
  updatedAt: string;
  createdAt: string;
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

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  RESOLVED: 'bg-gray-100 text-gray-600',
  HUMAN_TAKEOVER: 'bg-orange-100 text-orange-700',
  CLOSED: 'bg-red-100 text-red-600',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Agente IA',
  PENDING: 'Pendente',
  RESOLVED: 'Resolvida',
  HUMAN_TAKEOVER: 'Humano',
  CLOSED: 'Fechada',
};

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [actionError, setActionError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Transfer modal
  const [showTransfer, setShowTransfer] = useState(false);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [transferTarget, setTransferTarget] = useState('');

  // Internal note
  const [showNote, setShowNote] = useState(false);
  const [noteContent, setNoteContent] = useState('');

  // Save contact modal
  const [showSaveContact, setShowSaveContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '', phone: '', email: '', cpfCnpj: '', address: '', city: '',
    state: '', zipCode: '', company: '', role: '', notes: '',
  });
  const [savingContact, setSavingContact] = useState(false);
  const [saveContactError, setSaveContactError] = useState('');

  // Quick replies
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const { replies } = useQuickReplies();

  // Notification sound
  const { playBeep } = useNotificationSound();

  // Agent typing indicator
  const [agentTyping, setAgentTyping] = useState(false);

  useEffect(() => {
    fetchConversations();

    const token = localStorage.getItem('accessToken');
    const wsUrl = import.meta.env.VITE_WS_URL || (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws') : '');
  if (!wsUrl) { console.warn('VITE_WS_URL not configured'); return; }
  const s = socketIO(wsUrl, {
      auth: { token },
      transports: ['websocket'],
    });

    s.on('connect', () => console.log('Socket connected'));
    s.on('message:new', (data: { conversationId: string; message: Message }) => {
      if (data.conversationId === selectedId) {
        setMessages((prev) => [...prev, data.message]);
      }
      playBeep();
    });
    s.on('conversation:updated', () => fetchConversations());
    s.on('agent:typing', (data: { conversationId: string }) => {
      if (data.conversationId === selectedId) setAgentTyping(true);
    });
    s.on('agent:stopped-typing', (data: { conversationId: string }) => {
      if (data.conversationId === selectedId) setAgentTyping(false);
    });

    setSocket(s);
    return () => { s.disconnect(); };
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchMessages(selectedId);
      socket?.emit('conversation:join', selectedId);
    }
    return () => {
      if (selectedId) socket?.emit('conversation:leave', selectedId);
    };
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchConversations() {
    try {
      const { data } = await api.get('/conversations');
      setConversations(data);
    } catch { }
    finally { setLoading(false); }
  }

  async function fetchMessages(convId: string) {
    try {
      const { data } = await api.get(`/conversations/${convId}`);
      setMessages(data.messages || []);
    } catch {
      setActionError('Erro ao carregar mensagens');
    }
  }

  function clearError() { setActionError(''); }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedId) return;
    setActionError('');

    const conv = conversations.find((c) => c.id === selectedId);
    if (!conv) return;

    try {
      // If conversation is still ACTIVE (agent handling), auto-escalate to human
      if (conv.status === 'ACTIVE') {
        await api.post(`/conversations/${selectedId}/escalate`);
      }

      await api.post(`/conversations/${selectedId}/messages`, {
        content: newMessage,
        role: 'ASSISTANT',
      });
      setNewMessage('');
      fetchConversations();
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Erro ao enviar mensagem');
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setActionError('');

    const conv = conversations.find((c) => c.id === selectedId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data: upload } = await api.post('/media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Auto-escalate if needed
      if (conv?.status === 'ACTIVE') {
        await api.post(`/conversations/${selectedId}/escalate`);
      }

      await api.post(`/conversations/${selectedId}/messages`, {
        content: file.name,
        role: 'ASSISTANT',
        mediaUrl: upload.mediaUrl,
        mediaType: upload.mediaType,
      });
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Erro ao enviar arquivo');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function openSaveContactModal(conv: Conversation) {
    setContactForm({
      name: conv.contactName || '',
      phone: conv.contactPhone || '',
      email: conv.contactEmail || '',
      cpfCnpj: '', address: '', city: '',
      state: '', zipCode: '', company: '', role: '', notes: '',
    });
    setSaveContactError('');
    setShowSaveContact(true);
  }

  function handleContactFormChange(field: string, value: string) {
    let masked = value;
    if (field === 'phone') masked = maskPhone(value);
    else if (field === 'cpfCnpj') masked = maskCPFCNPJ(value);
    else if (field === 'zipCode') masked = maskCEP(value);
    setContactForm(f => ({ ...f, [field]: masked }));
  }

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !contactForm.name.trim() || !contactForm.phone.trim()) return;
    setSavingContact(true);
    setSaveContactError('');
    try {
      await api.post(`/contacts/quick-save/${selectedId}`, contactForm);
      setShowSaveContact(false);
      setSuccessMsg(`Contato "${contactForm.name}" salvo com sucesso!`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setSaveContactError(err.response?.data?.error || 'Erro ao salvar contato');
    } finally {
      setSavingContact(false);
    }
  }

  async function handleEscalate() {
    if (!selectedId) return;
    setActionError('');
    try {
      await api.post(`/conversations/${selectedId}/escalate`);
      fetchConversations();
      fetchMessages(selectedId);
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Erro ao escalar conversa');
    }
  }

  async function handleResolve() {
    if (!selectedId) return;
    setActionError('');
    try {
      await api.post(`/conversations/${selectedId}/resolve`);
      fetchConversations();
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Erro ao resolver conversa');
    }
  }

  async function handleReturnToAgent() {
    if (!selectedId) return;
    setActionError('');
    try {
      await api.post(`/conversations/${selectedId}/return-to-agent`);
      fetchConversations();
      fetchMessages(selectedId);
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Erro ao devolver ao agente');
    }
  }

  async function handleTransfer() {
    if (!selectedId || !transferTarget) return;
    setActionError('');
    try {
      await api.post(`/conversations/${selectedId}/transfer`, { toUserId: transferTarget });
      setShowTransfer(false);
      setTransferTarget('');
      fetchConversations();
      fetchMessages(selectedId);
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Erro ao transferir');
    }
  }

  async function openTransferModal() {
    try {
      const { data } = await api.get('/users');
      setTeamUsers(data.filter((u: TeamUser) => u.isActive));
      setShowTransfer(true);
    } catch (err: any) {
      setActionError('Erro ao carregar equipe');
    }
  }

  async function handleAddNote() {
    if (!selectedId || !noteContent.trim()) return;
    setActionError('');
    try {
      await api.post(`/conversations/${selectedId}/note`, { content: noteContent });
      setShowNote(false);
      setNoteContent('');
      fetchMessages(selectedId);
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Erro ao salvar nota');
    }
  }

  function insertQuickReply(content: string) {
    setNewMessage(content);
    setShowQuickReplies(false);
  }

  function renderMedia(msg: Message) {
    if (!msg.mediaUrl) return null;
    const baseUrl = import.meta.env.VITE_API_URL || '';
    const fullUrl = msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${baseUrl}${msg.mediaUrl}`;
    if (msg.mediaType === 'IMAGE') return <img src={fullUrl} alt="" className="max-w-[240px] rounded-lg mt-1" />;
    if (msg.mediaType === 'AUDIO') return <audio controls src={fullUrl} className="mt-1 max-w-[240px]" />;
    if (msg.mediaType === 'VIDEO') return <video controls src={fullUrl} className="mt-1 max-w-[240px] rounded-lg" />;
    return <a href={fullUrl} target="_blank" rel="noopener" className="flex items-center gap-1 text-xs text-indigo-500 underline mt-1"><FileText size={12} /> {msg.content}</a>;
  }

  const selectedConv = conversations.find((c) => c.id === selectedId);

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Carregando conversas...</p></div>;

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0">
      {/* Conversation list */}
      <div className="w-80 border-r border-gray-200 bg-white overflow-y-auto flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Conversas</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400">Nenhuma conversa</div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => { setSelectedId(conv.id); clearError(); setAgentTyping(false); }}
                className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition ${
                  selectedId === conv.id ? 'bg-indigo-50 border-l-2 border-l-indigo-600' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-gray-900 truncate">{conv.contactName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[conv.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[conv.status] || conv.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                  <span>{conv.channel.toLowerCase()}</span>
                  {conv.agent && <span>· {conv.agent.name}</span>}
                  <span>· {conv._count?.messages || 0} msgs</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedId ? (
          <>
            {/* Chat header */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {selectedConv?.contactName || 'Conversa'}
                </h3>
                <p className="text-xs text-gray-400">
                  {selectedConv?.channel} · {selectedConv?.contactPhone}
                  {selectedConv?.status === 'HUMAN_TAKEOVER' && selectedConv?.operator && (
                    <span className="text-orange-600"> · Atendimento: {selectedConv.operator.name}</span>
                  )}
                  {selectedConv?.status === 'ACTIVE' && selectedConv?.agent && (
                    <span className="text-green-600"> · Agente: {selectedConv.agent.name}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedConv?.contactPhone && (
                  <button onClick={() => openSaveContactModal(selectedConv)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition">
                    <Save size={14} /> Salvar Contato
                  </button>
                )}
                {selectedConv?.status === 'ACTIVE' && (
                  <button onClick={handleEscalate} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition">
                    <ArrowUpRight size={14} /> Assumir Conversa
                  </button>
                )}
                {selectedConv?.status === 'HUMAN_TAKEOVER' && (
                  <>
                    <button onClick={handleReturnToAgent} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition">
                      <ArrowDownLeft size={14} /> Devolver ao Agente
                    </button>
                    <button onClick={openTransferModal} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                      <ArrowLeftRight size={14} /> Transferir
                    </button>
                    <button onClick={() => setShowNote(true)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition">
                      <StickyNote size={14} /> Nota
                    </button>
                  </>
                )}
                {selectedConv?.status !== 'RESOLVED' && selectedConv?.status !== 'CLOSED' && (
                  <button onClick={handleResolve} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition">
                    <CheckCircle size={14} /> Resolver
                  </button>
                )}
              </div>
            </div>

            {/* Error bar */}
            {actionError && (
              <div className="bg-red-50 border-b border-red-200 px-6 py-2 flex items-center justify-between">
                <span className="text-sm text-red-700 flex items-center gap-2"><AlertCircle size={14} />{actionError}</span>
                <button onClick={clearError} className="text-red-400 hover:text-red-600"><X size={14} /></button>
              </div>
            )}

            {/* Success bar */}
            {successMsg && (
              <div className="bg-green-50 border-b border-green-200 px-6 py-2">
                <span className="text-sm text-green-700 flex items-center gap-2"><CheckCircle size={14} />{successMsg}</span>
              </div>
            )}

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
                          ? 'bg-gray-600 text-white rounded-br-md'
                          : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md'
                      }`}>
                        {msg.role === 'ASSISTANT' && (
                          <div className="flex items-center gap-1 mb-1">
                            <Bot size={12} className="text-indigo-500" />
                            <span className="text-xs text-indigo-500 font-medium">
                              {selectedConv?.status === 'HUMAN_TAKEOVER' ? 'Atendente' : 'Agente'}
                            </span>
                          </div>
                        )}
                        {msg.role === 'USER' && (
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-xs text-gray-300 font-medium">Cliente</span>
                          </div>
                        )}
                        {msg.mediaUrl ? (
                          <>
                            {renderMedia(msg)}
                            {msg.content !== msg.mediaUrl.split('/').pop() && <p>{msg.content}</p>}
                          </>
                        ) : msg.content}
                        <div className={`text-xs mt-1 ${msg.role === 'USER' ? 'text-gray-300' : 'text-gray-400'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {agentTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-gray-400">
                    <Bot size={12} className="inline mr-1 text-indigo-400 animate-pulse" /> digitando...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input — only allow sending in HUMAN_TAKEOVER or if escalating first */}
            <form onSubmit={handleSend} className="bg-white border-t border-gray-200 p-4">
              {selectedConv?.status === 'ACTIVE' ? (
                <div className="text-center py-2">
                  <p className="text-sm text-gray-500 mb-2">Conversa sendo atendida pelo agente IA</p>
                  <button type="button" onClick={handleEscalate}
                    className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition">
                    <ArrowUpRight size={14} className="inline mr-1" /> Assumir esta conversa
                  </button>
                </div>
              ) : selectedConv?.status === 'RESOLVED' || selectedConv?.status === 'CLOSED' ? (
                <div className="text-center py-2">
                  <p className="text-sm text-gray-400">Conversa encerrada</p>
                </div>
              ) : (
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
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition"
                    placeholder="Digite uma mensagem..."
                  />
                  <button type="submit" disabled={!newMessage.trim()}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50">
                    <Send size={18} />
                  </button>
                </div>
              )}
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare size={48} className="mx-auto mb-3 text-gray-300" />
              <p>Selecione uma conversa</p>
            </div>
          </div>
        )}
      </div>

      {/* Save Contact Modal */}
      {showSaveContact && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowSaveContact(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Salvar Contato</h2>
                <button onClick={() => setShowSaveContact(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={20} /></button>
              </div>

              {saveContactError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{saveContactError}</div>
              )}

              <form onSubmit={handleSaveContact} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                    <input type="text" required value={contactForm.name}
                      onChange={e => handleContactFormChange('name', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Nome do contato" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefone *</label>
                    <input type="text" required value={contactForm.phone}
                      onChange={e => handleContactFormChange('phone', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="(11) 99999-9999" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input type="email" value={contactForm.email}
                    onChange={e => handleContactFormChange('email', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="email@exemplo.com" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CPF/CNPJ</label>
                    <div className="relative">
                      <ShieldCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={contactForm.cpfCnpj}
                        onChange={e => handleContactFormChange('cpfCnpj', e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="000.000.000-00" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                    <div className="relative">
                      <ShieldCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={contactForm.zipCode}
                        onChange={e => handleContactFormChange('zipCode', e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="00000-000" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
                  <input type="text" value={contactForm.address}
                    onChange={e => handleContactFormChange('address', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Rua, número, bairro" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                    <input type="text" value={contactForm.city}
                      onChange={e => handleContactFormChange('city', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="São Paulo" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                    <input type="text" value={contactForm.state}
                      onChange={e => handleContactFormChange('state', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="SP" maxLength={2} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                    <div className="relative">
                      <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={contactForm.company}
                        onChange={e => handleContactFormChange('company', e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Nome da empresa" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                    <div className="relative">
                      <Briefcase size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={contactForm.role}
                        onChange={e => handleContactFormChange('role', e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Cargo do contato" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                  <textarea value={contactForm.notes}
                    onChange={e => handleContactFormChange('notes', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    rows={2} placeholder="Informações adicionais..." />
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                  <button type="button" onClick={() => setShowSaveContact(false)}
                    className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                    Cancelar
                  </button>
                  <button type="submit" disabled={savingContact}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition flex items-center gap-2">
                    {savingContact ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {savingContact ? 'Salvando...' : 'Salvar Contato'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Transfer modal */}
      {showTransfer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowTransfer(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Transferir Conversa</h2>
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

      {/* Note modal */}
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
                placeholder="Adicione uma nota visível apenas para a equipe..." />
              <div className="flex gap-2 justify-end mt-4">
                <button onClick={() => setShowNote(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancelar</button>
                <button onClick={handleAddNote} disabled={!noteContent.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition">Salvar Nota</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
