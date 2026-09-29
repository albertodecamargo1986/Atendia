import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, Users, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { useAuthStore } from '../stores/auth';
import { useSocketEvent } from '../hooks/useSocket';
import { useNotificationSound } from '../hooks/useNotificationSound';
import { fetchColleagues, type Colleague } from '../components/chat/ChatParts';

interface InternalMessage {
  id: string;
  content: string;
  senderId: string;
  receiverId?: string | null;
  groupId?: string | null;
  sender?: { id: string; name: string; avatarUrl?: string };
  createdAt: string;
  readAt?: string | null;
}

export default function InternalChatPage() {
  const { user } = useAuthStore();
  const [team, setTeam] = useState<Colleague[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const { playBeep } = useNotificationSound();

  useEffect(() => {
    fetchColleagues()
      .then((list) => setTeam(list.filter((u) => u.id !== user?.id)))
      .catch((err) => toast.error(getErrorMessage(err, 'Não foi possível carregar a equipe.')))
      .finally(() => setLoadingTeam(false));
  }, [user?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function markRead(list: InternalMessage[]) {
    list
      .filter((m) => m.receiverId === user?.id && !m.readAt)
      .forEach((m) => { api.post(`/internal-chat/${m.id}/read`).catch(() => { /* não é crítico */ }); });
  }

  // Mensagem nova: só entra na tela se for da conversa aberta
  useSocketEvent<{ conversationId?: string; message?: InternalMessage } | InternalMessage>('internal-message:new', (payload) => {
    const msg: InternalMessage | undefined = (payload as any)?.message ?? (payload as InternalMessage);
    if (!msg?.id || msg.groupId || !user) return;
    const involvesMe = msg.senderId === user.id || msg.receiverId === user.id;
    if (!involvesMe) return;
    const otherId = msg.senderId === user.id ? msg.receiverId : msg.senderId;
    if (otherId && otherId === selectedUser) {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.receiverId === user.id) markRead([msg]);
    } else if (msg.receiverId === user.id && msg.senderId !== user.id) {
      setUnread((prev) => ({ ...prev, [msg.senderId]: (prev[msg.senderId] || 0) + 1 }));
      playBeep();
    }
  });

  async function selectUser(userId: string) {
    setSelectedUser(userId);
    setUnread((prev) => ({ ...prev, [userId]: 0 }));
    setMessages([]);
    try {
      const { data } = await api.get(`/internal-chat/direct/${userId}`);
      const list: InternalMessage[] = data.messages || [];
      setMessages(list);
      markRead(list);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível carregar as mensagens.'));
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMsg.trim() || !selectedUser || sending) return;
    setSending(true);
    try {
      const { data } = await api.post('/internal-chat/send', { receiverId: selectedUser, content: newMsg.trim() });
      setNewMsg('');
      const sent: InternalMessage | undefined = data?.message ?? data;
      if (sent?.id) setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível enviar a mensagem.'));
    } finally {
      setSending(false);
    }
  }

  const selected = team.find((m) => m.id === selectedUser);

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] lg:h-[calc(100dvh-5.5rem)] rounded-xl overflow-hidden border border-[var(--border-color)]">
      <aside className={`${selectedUser ? 'hidden md:flex' : 'flex'} w-full md:w-64 bg-[var(--surface-primary)] md:border-r border-[var(--border-color)] flex-col shrink-0`}>
        <div className="p-4 border-b border-[var(--border-color)]">
          <h1 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Users size={18} /> Chat interno
          </h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Converse com a sua equipe</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1" aria-label="Equipe">
          {team.map((m) => (
            <button key={m.id} onClick={() => selectUser(m.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition text-left ${
                selectedUser === m.id ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-600)]' : 'hover:bg-[var(--surface-secondary)] text-[var(--text-primary)]'
              }`}>
              <div className="relative w-8 h-8 rounded-full bg-[var(--surface-tertiary)] flex items-center justify-center text-[var(--text-secondary)] font-medium text-xs">
                {(m.name || '?').charAt(0).toUpperCase()}
                {m.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--color-success)] border-2 border-[var(--surface-primary)]" aria-label="on-line" />}
              </div>
              <span className="flex-1 truncate font-medium">{m.name}</span>
              {unread[m.id] > 0 && (
                <span className="bg-[var(--color-primary-500)] text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center" aria-label={`${unread[m.id]} novas`}>{unread[m.id]}</span>
              )}
            </button>
          ))}
          {!loadingTeam && team.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)] text-center py-8 px-4">Ainda não há outras pessoas na equipe.</p>
          )}
        </nav>
      </aside>

      <main className={`${selectedUser ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 bg-[var(--surface-secondary)]`}>
        {!selectedUser ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle size={48} className="mx-auto text-[var(--text-tertiary)] mb-4" />
              <h2 className="text-lg font-medium text-[var(--text-primary)]">Escolha alguém da equipe</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">As mensagens aqui não vão para o cliente.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 sm:p-4 border-b border-[var(--border-color)] bg-[var(--surface-primary)] flex items-center gap-2">
              <button onClick={() => setSelectedUser(null)} className="md:hidden p-1.5 rounded-lg hover:bg-[var(--surface-tertiary)]" aria-label="Voltar para a lista">
                <ArrowLeft size={18} />
              </button>
              <h2 className="font-semibold text-[var(--text-primary)]">{selected?.name || 'Conversa'}</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-center text-sm text-[var(--text-tertiary)]">Nenhuma mensagem ainda. Diga um oi!</p>
              )}
              {messages.map((msg) => {
                const isMine = msg.senderId === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] md:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm break-words ${
                      isMine ? 'bg-[var(--color-primary-500)] text-white rounded-br-md' : 'bg-[var(--surface-primary)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-bl-md'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${isMine ? 'text-white/70' : 'text-[var(--text-tertiary)]'}`}>
                        {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={handleSend} className="p-3 sm:p-4 border-t border-[var(--border-color)] bg-[var(--surface-primary)] flex gap-2">
              <input type="text" value={newMsg} onChange={(e) => setNewMsg(e.target.value)}
                placeholder="Digite sua mensagem..." aria-label="Mensagem"
                className="flex-1 min-w-0 px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
              <button type="submit" disabled={!newMsg.trim() || sending} aria-label="Enviar mensagem"
                className="px-4 py-2.5 bg-[var(--color-primary-500)] text-white rounded-lg hover:bg-[var(--color-primary-600)] disabled:opacity-50 transition">
                <Send size={18} />
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
