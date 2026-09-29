import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, FileText, Paperclip, Send, StickyNote, User, Users, Zap } from 'lucide-react';
import { toast } from 'sonner';
import api, { API_BASE_URL } from '../../services/api';
import { getErrorMessage } from '../../lib/errors';
import { useQuickReplies } from '../../hooks/useQuickReplies';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  metadata?: any;
  createdAt: string;
}

/** Monta a URL de uma mídia (/uploads/...). Usa o mesmo endereço do site por padrão. */
export function mediaSrc(url: string): string {
  if (/^(https?:|blob:|data:)/.test(url)) return url;
  if (/^https?:/.test(API_BASE_URL)) {
    try { return new URL(url, API_BASE_URL).toString(); } catch { /* usa relativo */ }
  }
  return url;
}

/** Mostra imagem/áudio/vídeo; se não carregar (ex.: sessão expirada), mostra um link no lugar. */
export function MessageMedia({ msg, dark }: { msg: ChatMessage; dark?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!msg.mediaUrl) return null;
  const src = mediaSrc(msg.mediaUrl);
  const linkClass = `flex items-center gap-1 text-xs underline mt-1 ${dark ? 'text-white/90' : 'text-[var(--text-link)]'}`;
  const fallback = (label: string) => (
    <a href={src} target="_blank" rel="noopener noreferrer" className={linkClass}>
      <FileText size={12} /> {label}
    </a>
  );

  if (failed) return fallback('Abrir arquivo');
  switch (msg.mediaType) {
    case 'IMAGE':
      return <img src={src} alt="Imagem enviada" loading="lazy" onError={() => setFailed(true)} className="max-w-[240px] w-full rounded-lg mt-1" />;
    case 'AUDIO':
      return <audio controls src={src} onError={() => setFailed(true)} className="mt-1 max-w-[240px]" />;
    case 'VIDEO':
      return <video controls src={src} onError={() => setFailed(true)} className="mt-1 max-w-[240px] rounded-lg" />;
    default:
      return fallback(msg.content || 'Abrir arquivo');
  }
}

function time(d: string) {
  return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Balão de mensagem. Cliente fica à esquerda; empresa (IA ou atendente) à direita. */
export function MessageBubble({ msg, humanMode }: { msg: ChatMessage; humanMode?: boolean }) {
  const isNote = msg.metadata?.isInternalNote;
  if (isNote) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] md:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] border-l-4 border-l-[var(--color-warning)] text-[var(--text-primary)]">
          <span className="flex items-center gap-1 text-xs font-medium text-[var(--color-warning)] mb-0.5">
            <StickyNote size={12} /> Nota interna (só a equipe vê)
          </span>
          {msg.content.replace('[Nota Interna] ', '')}
          <div className="text-xs mt-1 text-[var(--text-tertiary)]">{time(msg.createdAt)}</div>
        </div>
      </div>
    );
  }
  if (msg.role === 'SYSTEM') {
    return (
      <div className="flex justify-center">
        <div className="text-xs text-[var(--text-secondary)] bg-[var(--surface-tertiary)] px-3 py-1 rounded-full text-center">{msg.content}</div>
      </div>
    );
  }
  const fromCustomer = msg.role === 'USER';
  const isHuman = !!msg.metadata?.sentByUserId || !!msg.metadata?.operatorId || (humanMode && !msg.metadata?.fromAI);
  const showCaption = msg.mediaUrl ? msg.content !== msg.mediaUrl.split('/').pop() : true;
  return (
    <div className={`flex ${fromCustomer ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[85%] md:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm break-words ${
        fromCustomer
          ? 'bg-[var(--surface-primary)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-bl-md'
          : 'bg-[var(--color-primary-500)] text-white rounded-br-md'
      }`}>
        <div className={`flex items-center gap-1 mb-1 text-xs font-medium ${fromCustomer ? 'text-[var(--text-secondary)]' : 'text-white/80'}`}>
          {fromCustomer ? <User size={12} /> : isHuman ? <Users size={12} /> : <Bot size={12} />}
          {fromCustomer ? 'Cliente' : isHuman ? 'Atendente' : 'Agente IA'}
        </div>
        {msg.mediaUrl && <MessageMedia msg={msg} dark={!fromCustomer} />}
        {showCaption && <p className="whitespace-pre-wrap">{msg.content}</p>}
        <div className={`text-xs mt-1 ${fromCustomer ? 'text-[var(--text-tertiary)]' : 'text-white/70'}`}>{time(msg.createdAt)}</div>
      </div>
    </div>
  );
}

/** Campo de digitação com anexo e respostas rápidas. */
export function ChatComposer({ onSendText, onSendFile, placeholder = 'Digite uma mensagem...' }: {
  onSendText: (text: string) => Promise<boolean>;
  onSendFile: (file: File) => Promise<void>;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { replies } = useQuickReplies();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    const ok = await onSendText(value);
    setSending(false);
    if (ok) setText('');
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSending(true);
    try { await onSendFile(file); } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <form onSubmit={submit} className="bg-[var(--surface-primary)] border-t border-[var(--border-color)] p-3 sm:p-4">
      <div className="flex gap-2 items-end">
        <div className="flex gap-1">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={sending}
            className="p-2.5 rounded-lg hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--color-primary-500)] transition"
            title="Anexar arquivo" aria-label="Anexar arquivo">
            <Paperclip size={18} />
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={onFile} accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />
          <div className="relative">
            <button type="button" onClick={() => setShowReplies(!showReplies)}
              className="p-2.5 rounded-lg hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--color-warning)] transition"
              title="Respostas rápidas" aria-label="Respostas rápidas" aria-expanded={showReplies}>
              <Zap size={18} />
            </button>
            {showReplies && (
              <div className="absolute bottom-12 left-0 w-64 max-h-60 overflow-y-auto bg-[var(--surface-primary)] border border-[var(--border-color)] rounded-xl shadow-dropdown z-50">
                <div className="p-2 border-b border-[var(--border-color)] text-xs font-semibold text-[var(--text-secondary)]">Respostas rápidas</div>
                {replies.length === 0 ? (
                  <p className="p-3 text-xs text-[var(--text-tertiary)]">Nenhuma resposta rápida cadastrada.</p>
                ) : replies.map((r) => (
                  <button key={r.id} type="button" onClick={() => { setText(r.content); setShowReplies(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--surface-secondary)] transition text-sm border-b border-[var(--border-color)] last:border-b-0">
                    <span className="font-mono text-xs text-[var(--color-primary-500)]">/{r.shortcode}</span>
                    <p className="text-[var(--text-secondary)] text-xs mt-0.5 truncate">{r.content}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Mensagem"
          className="flex-1 min-w-0 px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none text-sm"
          placeholder={placeholder}
        />
        <button type="submit" disabled={!text.trim() || sending} aria-label="Enviar mensagem"
          className="px-4 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white rounded-lg transition disabled:opacity-50">
          <Send size={18} />
        </button>
      </div>
    </form>
  );
}

export interface Colleague { id: string; name: string; role?: string; isOnline?: boolean }

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Administrador', OWNER: 'Dono(a)', ADMIN: 'Administrador', SUPERVISOR: 'Supervisor', OPERATOR: 'Atendente',
};

/** Busca colegas do mesmo time (funciona para qualquer papel). */
export async function fetchColleagues(): Promise<Colleague[]> {
  const { data } = await api.get('/users/colleagues');
  return Array.isArray(data) ? data : data?.data || [];
}

/** Janela para escolher para quem transferir. */
export function TransferModal({ open, onClose, onConfirm, excludeUserId }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (userId: string) => Promise<void>;
  excludeUserId?: string;
}) {
  const [users, setUsers] = useState<Colleague[]>([]);
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTarget('');
    setLoading(true);
    fetchColleagues()
      .then((list) => setUsers(list.filter((u) => u.id !== excludeUserId)))
      .catch((err) => toast.error(getErrorMessage(err, 'Não foi possível carregar a equipe.')))
      .finally(() => setLoading(false));
  }, [open, excludeUserId]);

  async function handleConfirm() {
    if (!target) return;
    setSending(true);
    try { await onConfirm(target); } finally { setSending(false); }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transferir para outra pessoa"
      size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleConfirm} disabled={!target} loading={sending}>Transferir</Button>
      </>}
    >
      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Carregando equipe...</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Não há outras pessoas na equipe. Cadastre atendentes em "Equipe".</p>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {users.map((u) => (
            <button key={u.id} type="button" onClick={() => setTarget(u.id)} aria-pressed={target === u.id}
              className={`w-full text-left px-4 py-3 rounded-lg border transition ${target === u.id ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]' : 'border-[var(--border-color)] hover:bg-[var(--surface-secondary)]'}`}>
              <div className="flex items-center gap-3">
                <div className="relative w-8 h-8 bg-[var(--surface-tertiary)] rounded-full flex items-center justify-center">
                  <Users size={14} className="text-[var(--text-secondary)]" />
                  {u.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--color-success)] border-2 border-[var(--surface-primary)]" />}
                </div>
                <div>
                  <p className="font-medium text-sm text-[var(--text-primary)]">{u.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{ROLE_LABELS[u.role || ''] || u.role}{u.isOnline ? ' · on-line' : ''}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Janela de nota interna. */
export function NoteModal({ open, onClose, onSave }: {
  open: boolean; onClose: () => void; onSave: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setText(''); }, [open]);
  async function save() {
    setSaving(true);
    const ok = await onSave(text.trim());
    setSaving(false);
    if (ok) onClose();
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nota interna"
      description="Só a equipe vê. O cliente não recebe esta nota."
      size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={!text.trim()} loading={saving}>Salvar nota</Button>
      </>}
    >
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="Texto da nota"
        className="w-full px-3 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none text-sm"
        placeholder="Ex.: cliente pediu retorno amanhã de manhã" />
    </Modal>
  );
}

/** Envia um arquivo para /media e devolve { mediaUrl, mediaType }. */
export async function uploadMedia(file: File): Promise<{ mediaUrl: string; mediaType: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/media', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}
