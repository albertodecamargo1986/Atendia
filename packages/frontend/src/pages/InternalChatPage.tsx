import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { io as socketIO, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth';
import { MessageCircle, Send, Users } from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  sender?: { id: string; name: string; avatarUrl?: string };
  createdAt: string;
}

export default function InternalChatPage() {
  const { user } = useAuthStore();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/users').then(({ data }) => {
      const members = data.filter((u: any) => u.id !== user?.id && u.isActive);
      setTeam(members);
    }).catch(() => {});

    const wsUrl = import.meta.env.VITE_WS_URL || (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws') : '');
  if (!wsUrl) return;
    const socket = socketIO(wsUrl, { auth: { token: localStorage.getItem('accessToken') } });
    socketRef.current = socket;

    socket.on('internal-message:new', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
      if (msg.senderId !== user?.id) {
        setUnread(prev => ({ ...prev, [msg.senderId]: (prev[msg.senderId] || 0) + 1 }));
      }
    });

    api.get('/internal-chat/unread').then(({ data }) => {
      // marshal unread counts
    }).catch(() => {});

    return () => { socket.disconnect(); };
  }, [user?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function selectUser(userId: string) {
    setSelectedUser(userId);
    setUnread(prev => ({ ...prev, [userId]: 0 }));
    try {
      const { data } = await api.get(`/internal-chat/direct/${userId}`);
      setMessages(data.messages || []);
    } catch { setMessages([]); }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMsg.trim() || !selectedUser || sending) return;
    setSending(true);
    try {
      await api.post('/internal-chat/send', { receiverId: selectedUser, content: newMsg.trim() });
      setNewMsg('');
    } catch { /* ignore */ }
    finally { setSending(false); }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6">
      {/* Sidebar - team list */}
      <aside className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Users size={18} /> Chat Interno
          </h2>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {team.map(m => (
            <button key={m.id} onClick={() => selectUser(m.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition text-left ${
                selectedUser === m.id ? 'bg-indigo-100 text-indigo-900' : 'hover:bg-gray-100 text-gray-700'
              }`}>
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium text-xs">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 truncate font-medium">{m.name}</span>
              {unread[m.id] > 0 && (
                <span className="bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{unread[m.id]}</span>
              )}
            </button>
          ))}
          {team.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">Nenhum membro na equipe</p>
          )}
        </nav>
      </aside>

      {/* Chat area */}
      <main className="flex-1 flex flex-col">
        {!selectedUser ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">Selecione um membro</h3>
              <p className="text-sm text-gray-500 mt-1">Escolha alguém da equipe para conversar</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-200 bg-white">
              <h3 className="font-semibold text-gray-900">
                {team.find(m => m.id === selectedUser)?.name || 'Conversa'}
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messages.map(msg => {
                const isMine = msg.senderId === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${
                      isMine ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md'
                    }`}>
                      <p>{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${isMine ? 'text-indigo-200' : 'text-gray-400'}`}>
                        {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={handleSend} className="p-4 border-t border-gray-200 bg-white flex gap-2">
              <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)}
                placeholder="Digite sua mensagem..."
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              <button type="submit" disabled={!newMsg.trim() || sending}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                <Send size={18} />
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
