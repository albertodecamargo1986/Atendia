import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare, ArrowUpRight, CheckCircle, ArrowDownLeft, ArrowLeftRight, StickyNote,
  Save, ArrowLeft, Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { useSocketEvent, useSocketSubscription } from '../hooks/useSocket';
import { useNotificationSound } from '../hooks/useNotificationSound';
import { maskPhone, maskCPFCNPJ, maskCEP } from '../lib/masks';
import {
  MessageBubble, ChatComposer, TransferModal, NoteModal, uploadMedia, type ChatMessage,
} from '../components/chat/ChatParts';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { askConfirm } from '../components/ui/ConfirmDialog';

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

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  PENDING: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
  RESOLVED: 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]',
  HUMAN_TAKEOVER: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
  CLOSED: 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'IA atendendo',
  PENDING: 'Pendente',
  RESOLVED: 'Resolvida',
  HUMAN_TAKEOVER: 'Com atendente',
  CLOSED: 'Encerrada',
};

const EMPTY_CONTACT = {
  name: '', phone: '', email: '', cpfCnpj: '', address: '', city: '',
  state: '', zipCode: '', company: '', role: '', notes: '',
};

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [showTransfer, setShowTransfer] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showSaveContact, setShowSaveContact] = useState(false);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);
  const [savingContact, setSavingContact] = useState(false);

  const { playBeep } = useNotificationSound();

  const fetchConversations = useCallback(async (showError = false) => {
    try {
      const { data } = await api.get('/conversations');
      setConversations(data.conversations || (Array.isArray(data) ? data : []));
    } catch (err) {
      if (showError) toast.error(getErrorMessage(err, 'Não foi possível carregar as conversas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const { data } = await api.get(`/conversations/${convId}`);
      setMessages(data.messages || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível carregar as mensagens.'));
    }
  }, []);

  useEffect(() => { fetchConversations(true); }, [fetchConversations]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    setLoadingMessages(true);
    setAgentTyping(false);
    fetchMessages(selectedId).finally(() => setLoadingMessages(false));
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentTyping]);

  // ── Tempo real (handlers sempre com o estado atual) ──
  useSocketSubscription('conversation:join', 'conversation:leave', selectedId);

  useSocketEvent<{ conversationId: string; message: ChatMessage }>('message:new', (data) => {
    if (data.conversationId === selectedId) {
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      if (data.message.role !== 'USER') setAgentTyping(false);
    }
    if (data.message?.role === 'USER') playBeep();
    fetchConversations();
  });
  useSocketEvent('conversation:updated', () => { fetchConversations(); });
  useSocketEvent<{ conversationId: string }>('conversation:deleted', (data) => {
    if (data.conversationId === selectedId) setSelectedId(null);
    fetchConversations();
  });
  useSocketEvent<{ conversationId: string }>('agent:typing', (data) => {
    if (data.conversationId === selectedId) setAgentTyping(true);
  });
  useSocketEvent<{ conversationId: string }>('agent:stopped-typing', (data) => {
    if (data.conversationId === selectedId) setAgentTyping(false);
  });

  const selectedConv = conversations.find((c) => c.id === selectedId);

  async function ensureHumanMode(conv: Conversation) {
    if (conv.status === 'ACTIVE') {
      await api.post(`/conversations/${conv.id}/escalate`);
    }
  }

  async function handleSendText(text: string): Promise<boolean> {
    if (!selectedConv) return false;
    try {
      await ensureHumanMode(selectedConv);
      await api.post(`/conversations/${selectedConv.id}/messages`, { content: text, role: 'ASSISTANT' });
      await Promise.all([fetchMessages(selectedConv.id), fetchConversations()]);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível enviar a mensagem.'));
      return false;
    }
  }

  async function handleSendFile(file: File) {
    if (!selectedConv) return;
    try {
      const upload = await uploadMedia(file);
      await ensureHumanMode(selectedConv);
      await api.post(`/conversations/${selectedConv.id}/messages`, {
        content: file.name, role: 'ASSISTANT', mediaUrl: upload.mediaUrl, mediaType: upload.mediaType,
      });
      toast.success('Arquivo enviado.');
      await Promise.all([fetchMessages(selectedConv.id), fetchConversations()]);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível enviar o arquivo.'));
    }
  }

  async function runAction(fn: () => Promise<unknown>, success: string, fallback: string) {
    try {
      await fn();
      toast.success(success);
      await fetchConversations();
      if (selectedId) await fetchMessages(selectedId);
    } catch (err) {
      toast.error(getErrorMessage(err, fallback));
    }
  }

  const handleEscalate = () => selectedId && runAction(
    () => api.post(`/conversations/${selectedId}/escalate`),
    'Você assumiu a conversa. A IA parou de responder.', 'Não foi possível assumir a conversa.');

  const handleReturnToAgent = () => selectedId && runAction(
    () => api.post(`/conversations/${selectedId}/return-to-agent`),
    'Conversa devolvida para a IA.', 'Não foi possível devolver para a IA.');

  async function handleResolve() {
    if (!selectedId) return;
    const ok = await askConfirm({
      title: 'Marcar como resolvida?',
      description: 'A conversa sai da lista de atendimento. Se o cliente escrever de novo, ela volta.',
      confirmLabel: 'Resolver',
    });
    if (!ok) return;
    runAction(() => api.post(`/conversations/${selectedId}/resolve`), 'Conversa resolvida.', 'Não foi possível resolver.');
  }

  async function handleTransfer(toUserId: string) {
    if (!selectedId) return;
    try {
      await api.post(`/conversations/${selectedId}/transfer`, { toUserId });
      toast.success('Conversa transferida.');
      setShowTransfer(false);
      await fetchConversations();
      await fetchMessages(selectedId);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível transferir.'));
    }
  }

  async function handleAddNote(content: string): Promise<boolean> {
    if (!selectedId || !content) return false;
    try {
      await api.post(`/conversations/${selectedId}/note`, { content });
      toast.success('Nota salva.');
      await fetchMessages(selectedId);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar a nota.'));
      return false;
    }
  }

  function openSaveContactModal(conv: Conversation) {
    setContactForm({ ...EMPTY_CONTACT, name: conv.contactName || '', phone: conv.contactPhone || '', email: conv.contactEmail || '' });
    setShowSaveContact(true);
  }

  function setField(field: keyof typeof EMPTY_CONTACT, value: string) {
    let masked = value;
    if (field === 'phone') masked = maskPhone(value);
    else if (field === 'cpfCnpj') masked = maskCPFCNPJ(value);
    else if (field === 'zipCode') masked = maskCEP(value);
    setContactForm((f) => ({ ...f, [field]: masked }));
  }

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !contactForm.name.trim() || !contactForm.phone.trim()) return;
    setSavingContact(true);
    try {
      await api.post(`/contacts/quick-save/${selectedId}`, contactForm);
      setShowSaveContact(false);
      toast.success(`Contato "${contactForm.name}" salvo!`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar o contato.'));
    } finally {
      setSavingContact(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-[var(--text-secondary)]">Carregando conversas...</p></div>;
  }

  const actionBtn = 'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition border border-[var(--border-color)] hover:bg-[var(--surface-tertiary)]';

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] lg:h-[calc(100dvh-5.5rem)] rounded-xl overflow-hidden border border-[var(--border-color)]">
      {/* Lista */}
      <div className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-80 md:border-r border-[var(--border-color)] bg-[var(--surface-primary)] flex-col`}>
        <div className="p-4 border-b border-[var(--border-color)]">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Conversas</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <MessageSquare size={40} className="text-[var(--text-tertiary)] mb-3" />
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-1">Nenhuma conversa ainda</h2>
              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed max-w-[220px]">
                As conversas aparecem aqui quando clientes mandarem mensagem para o WhatsApp conectado.
              </p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`w-full text-left p-4 border-b border-[var(--border-color)] hover:bg-[var(--surface-secondary)] transition ${
                  selectedId === conv.id ? 'bg-[var(--color-primary-50)] border-l-2 border-l-[var(--color-primary-500)]' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-[var(--text-primary)] truncate">{conv.contactName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[conv.status] || STATUS_COLORS.RESOLVED}`}>
                    {STATUS_LABELS[conv.status] || conv.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-tertiary)]">
                  <span>{conv.channel === 'WHATSAPP' ? 'WhatsApp' : conv.channel.toLowerCase()}</span>
                  {conv.agent && <span>· {conv.agent.name}</span>}
                  <span>· {conv._count?.messages || 0} msgs</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Conversa aberta */}
      <div className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-[var(--surface-secondary)] min-w-0`}>
        {selectedId && selectedConv ? (
          <>
            <div className="bg-[var(--surface-primary)] border-b border-[var(--border-color)] px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => setSelectedId(null)} className="md:hidden p-1.5 rounded-lg hover:bg-[var(--surface-tertiary)]" aria-label="Voltar para a lista">
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                  <h2 className="font-semibold text-[var(--text-primary)] truncate">{selectedConv.contactName || 'Conversa'}</h2>
                  <p className="text-xs text-[var(--text-tertiary)] truncate">
                    {selectedConv.contactPhone}
                    {selectedConv.status === 'HUMAN_TAKEOVER' && selectedConv.operator && (
                      <span className="text-[var(--color-info)]"> · Atendente: {selectedConv.operator.name}</span>
                    )}
                    {selectedConv.status === 'ACTIVE' && selectedConv.agent && (
                      <span className="text-[var(--color-success)]"> · IA: {selectedConv.agent.name}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedConv.contactPhone && (
                  <button onClick={() => openSaveContactModal(selectedConv)} className={`${actionBtn} text-[var(--color-primary-500)]`}>
                    <Save size={14} /> Salvar contato
                  </button>
                )}
                {selectedConv.status === 'ACTIVE' && (
                  <button onClick={handleEscalate} className={`${actionBtn} text-[var(--color-warning)]`}>
                    <ArrowUpRight size={14} /> Assumir conversa
                  </button>
                )}
                {selectedConv.status === 'HUMAN_TAKEOVER' && (
                  <>
                    <button onClick={handleReturnToAgent} className={`${actionBtn} text-[var(--color-info)]`}>
                      <ArrowDownLeft size={14} /> Devolver para a IA
                    </button>
                    <button onClick={() => setShowTransfer(true)} className={`${actionBtn} text-[var(--text-primary)]`}>
                      <ArrowLeftRight size={14} /> Transferir
                    </button>
                    <button onClick={() => setShowNote(true)} className={`${actionBtn} text-[var(--text-primary)]`}>
                      <StickyNote size={14} /> Nota
                    </button>
                  </>
                )}
                {selectedConv.status !== 'RESOLVED' && selectedConv.status !== 'CLOSED' && (
                  <button onClick={handleResolve} className={`${actionBtn} text-[var(--color-success)]`}>
                    <CheckCircle size={14} /> Resolver
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3">
              {loadingMessages && messages.length === 0 && (
                <p className="text-center text-sm text-[var(--text-tertiary)]">Carregando mensagens...</p>
              )}
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} humanMode={selectedConv.status === 'HUMAN_TAKEOVER'} />
              ))}
              {agentTyping && (
                <div className="flex justify-end">
                  <div className="bg-[var(--surface-primary)] border border-[var(--border-color)] rounded-2xl px-4 py-2.5 text-sm text-[var(--text-tertiary)]">
                    <Bot size={12} className="inline mr-1 animate-pulse" /> IA digitando...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {selectedConv.status === 'RESOLVED' || selectedConv.status === 'CLOSED' ? (
              <div className="bg-[var(--surface-primary)] border-t border-[var(--border-color)] p-4 text-center text-sm text-[var(--text-tertiary)]">
                Conversa encerrada
              </div>
            ) : (
              <>
                {selectedConv.status === 'ACTIVE' && (
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
              <MessageSquare size={48} className="mx-auto mb-3" />
              <p>Selecione uma conversa</p>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={showSaveContact}
        onClose={() => setShowSaveContact(false)}
        title="Salvar contato"
        size="lg"
      >
        <form onSubmit={handleSaveContact} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Nome *" required value={contactForm.name} onChange={(e) => setField('name', e.target.value)} placeholder="Nome do contato" />
            <Input label="Telefone *" required value={contactForm.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="(11) 99999-9999" />
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

      <TransferModal open={showTransfer} onClose={() => setShowTransfer(false)} onConfirm={handleTransfer} />
      <NoteModal open={showNote} onClose={() => setShowNote(false)} onSave={handleAddNote} />
    </div>
  );
}
