import { useEffect, useState } from 'react';
import { Smartphone, Plus, Wifi, WifiOff, Trash2, RefreshCw, Bot } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { useSocketEvent, useSocketSubscription } from '../hooks/useSocket';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { askConfirm } from '../components/ui/ConfirmDialog';
import WhatsAppQrConnect from '../components/WhatsAppQrConnect';
import { useAuthStore, isOwnerOrAdmin } from '../stores/auth';

interface WASession {
  id: string;
  phoneNumber: string | null;
  sessionId: string;
  status: string;
  qrCode?: string | null;
  agentId?: string | null;
  lastConnectedAt?: string;
  createdAt: string;
}

interface AgentOption {
  id: string;
  name: string;
  isActive?: boolean;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  CONNECTING: { color: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]', label: 'Aguardando leitura do QR' },
  CONNECTED: { color: 'bg-[var(--color-success-bg)] text-[var(--color-success)]', label: 'Conectado' },
  DISCONNECTED: { color: 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]', label: 'Desconectado' },
  BANNED: { color: 'bg-[var(--color-error-bg)] text-[var(--color-error)]', label: 'Bloqueado pelo WhatsApp' },
};

export default function WhatsAppPage() {
  const { user } = useAuthStore();
  const canManage = isOwnerOrAdmin(user?.role);
  const [sessions, setSessions] = useState<WASession[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [savingAgentFor, setSavingAgentFor] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions(true);
    api.get('/agents')
      .then(({ data }) => setAgents(Array.isArray(data) ? data : data?.data || []))
      .catch(() => setAgents([]));
  }, []);

  useSocketSubscription('whatsapp:subscribe', null);
  useSocketEvent('whatsapp:status', () => { fetchSessions(); });

  async function fetchSessions(first = false) {
    try {
      const { data } = await api.get('/whatsapp');
      const list: WASession[] = Array.isArray(data) ? data : [];
      setSessions(list);
      // Se já existe uma sessão aguardando QR, mostra o QR dela ao abrir a tela
      if (first) {
        const pending = list.find((s) => s.status === 'CONNECTING');
        if (pending) setQrSessionId(pending.id);
      }
    } catch (err) {
      if (first) toast.error(getErrorMessage(err, 'Não foi possível carregar os números.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    setStarting(true);
    try {
      const { data: session } = await api.post('/whatsapp/connect');
      setQrSessionId(session.id);
      fetchSessions();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível iniciar a conexão.'));
    } finally {
      setStarting(false);
    }
  }

  async function handleReconnect(id: string) {
    try {
      await api.post(`/whatsapp/${id}/reconnect`);
      setQrSessionId(id);
      fetchSessions();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível reconectar.'));
    }
  }

  async function handleDisconnect(id: string) {
    const ok = await askConfirm({
      title: 'Desconectar este número?',
      description: 'O AtendIA vai parar de responder por este WhatsApp até você conectar de novo.',
      confirmLabel: 'Desconectar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/whatsapp/${id}/disconnect`);
      toast.success('Número desconectado.');
      fetchSessions();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível desconectar.'));
    }
  }

  async function handleDelete(id: string) {
    const ok = await askConfirm({
      title: 'Remover esta conexão?',
      description: 'A conexão será apagada. Para usar este número de novo será preciso ler um novo QR Code.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/whatsapp/${id}`);
      if (qrSessionId === id) setQrSessionId(null);
      toast.success('Conexão removida.');
      fetchSessions();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível remover.'));
    }
  }

  async function handleAgentChange(sessionId: string, agentId: string) {
    setSavingAgentFor(sessionId);
    try {
      await api.patch(`/whatsapp/${sessionId}`, { agentId: agentId || null });
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, agentId: agentId || null } : s)));
      toast.success(agentId ? 'Agente definido para este número.' : 'Este número usará o agente padrão.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar o agente.'));
    } finally {
      setSavingAgentFor(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-[var(--surface-tertiary)] rounded" />
        <div className="h-4 w-72 bg-[var(--surface-tertiary)] rounded" />
        <div className="h-24 bg-[var(--surface-tertiary)] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="WhatsApp"
        description="Conecte os números de WhatsApp que o AtendIA vai atender"
        actions={canManage ? (
          <Button onClick={handleConnect} loading={starting} disabled={!!qrSessionId}>
            <Plus size={18} />
            Conectar número
          </Button>
        ) : undefined}
      />

      {qrSessionId && (
        <Card padding="lg" className="mb-6">
          <WhatsAppQrConnect
            sessionId={qrSessionId}
            onConnected={() => {
              toast.success('WhatsApp conectado com sucesso!');
              fetchSessions();
              setTimeout(() => setQrSessionId(null), 2500);
            }}
            onClose={() => setQrSessionId(null)}
          />
        </Card>
      )}

      {sessions.length === 0 && !qrSessionId ? (
        <EmptyState
          icon={Smartphone}
          title="Nenhum WhatsApp conectado"
          description="Conecte o número da sua empresa para o AtendIA começar a receber e responder mensagens."
          action={canManage ? { label: 'Conectar número', onClick: handleConnect } : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => {
            const config = STATUS_CONFIG[session.status] || STATUS_CONFIG.DISCONNECTED;
            const connected = session.status === 'CONNECTED';
            return (
              <Card key={session.id} padding="md">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      connected ? 'bg-[var(--color-success-bg)]' : 'bg-[var(--surface-tertiary)]'
                    }`}>
                      {connected
                        ? <Wifi size={20} className="text-[var(--color-success)]" />
                        : <WifiOff size={20} className="text-[var(--text-tertiary)]" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-[var(--text-primary)] text-sm truncate">
                        {session.phoneNumber || 'Número ainda não conectado'}
                      </h3>
                      <span className={`inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full ${config.color}`}>{config.label}</span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      {session.status === 'CONNECTING' && qrSessionId !== session.id && (
                        <Button variant="secondary" size="sm" onClick={() => setQrSessionId(session.id)}>
                          Ver QR Code
                        </Button>
                      )}
                      {connected && (
                        <Button variant="ghost" size="sm" onClick={() => handleDisconnect(session.id)} title="Desconectar" aria-label="Desconectar">
                          <WifiOff size={16} />
                        </Button>
                      )}
                      {(session.status === 'DISCONNECTED' || session.status === 'BANNED') && (
                        <Button variant="secondary" size="sm" onClick={() => handleReconnect(session.id)}>
                          <RefreshCw size={14} /> Reconectar
                        </Button>
                      )}
                      {!connected && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(session.id)} title="Remover" aria-label="Remover conexão">
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <label htmlFor={`agent-${session.id}`} className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] shrink-0">
                    <Bot size={15} /> Este número é atendido por:
                  </label>
                  <select
                    id={`agent-${session.id}`}
                    value={session.agentId || ''}
                    disabled={!canManage || savingAgentFor === session.id}
                    onChange={(e) => handleAgentChange(session.id, e.target.value)}
                    className="w-full sm:w-64 px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] disabled:opacity-60"
                  >
                    <option value="">Agente padrão (primeiro ativo)</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}{a.isActive === false ? ' (inativo)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {session.lastConnectedAt && (
                  <p className="text-xs text-[var(--text-tertiary)] mt-2">
                    Última conexão: {new Date(session.lastConnectedAt).toLocaleString('pt-BR')}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
