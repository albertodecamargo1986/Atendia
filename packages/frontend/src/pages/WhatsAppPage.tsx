import { useEffect, useState } from 'react';
import { Smartphone, Plus, Wifi, WifiOff, Trash2, RefreshCw, Bot, ShieldAlert, QrCode, BadgeCheck, Settings2 } from 'lucide-react';
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
import WhatsAppCloudWizard, { qualityBadge, tierText, type CloudBasicInfo, type CloudInfo, type CloudSession } from '../components/WhatsAppCloudWizard';
import { Modal } from '../components/ui/Modal';
import { useAuthStore, isOwnerOrAdmin } from '../stores/auth';

interface WASession {
  id: string;
  phoneNumber: string | null;
  sessionId: string;
  status: string;
  qrCode?: string | null;
  agentId?: string | null;
  lastConnectedAt?: string;
  restrictedUntil?: string | null;
  campaignsDisabledAt?: string | null;
  createdAt: string;
  /** BAILEYS (QR Code) | CLOUD_API (oficial da Meta) */
  provider?: 'BAILEYS' | 'CLOUD_API';
  /** OWNER/ADMIN: resumo completo; demais papéis: só { provider, status, quality } */
  cloud?: Partial<CloudInfo> & Partial<CloudBasicInfo>;
}

const isOfficial = (s: WASession) => s.provider === 'CLOUD_API';

function isRestricted(s: WASession): boolean {
  return !!s.restrictedUntil && new Date(s.restrictedUntil).getTime() > Date.now();
}

function formatUntil(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hhmm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? hhmm : `${d.toLocaleDateString('pt-BR')} ${hhmm}`;
}

interface AgentOption {
  id: string;
  name: string;
  isActive?: boolean;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  CONNECTING: { color: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]', label: 'Aguardando leitura do QR' },
  CONNECTED: { color: 'bg-[var(--color-success-bg)] text-[var(--color-success)]', label: 'Conectado' },
  DISCONNECTED: { color: 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]', label: 'Desconectado — reconecte' },
  BANNED: { color: 'bg-[var(--color-error-bg)] text-[var(--color-error)]', label: 'Bloqueado' },
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
  const [choosing, setChoosing] = useState(false);
  const [wizard, setWizard] = useState<{ session: CloudSession | null; step?: 1 | 2 | 3 | 4 } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions(true);
    api.get('/agents')
      .then(({ data }) => setAgents(Array.isArray(data) ? data : data?.data || []))
      .catch(() => setAgents([]));
  }, []);

  useSocketSubscription('whatsapp:subscribe', null);
  useSocketEvent('whatsapp:status', () => { fetchSessions(); });
  // Avisos de segurança do número (restrição, bloqueio, reconexão adiada, muitas automações)
  useSocketEvent<{ message?: string }>('whatsapp:restricted', (data) => {
    toast.warning(data?.message || 'O WhatsApp limitou temporariamente este número.', { duration: 15000 });
    fetchSessions();
  });
  useSocketEvent<{ message?: string }>('whatsapp:banned', (data) => {
    toast.error(data?.message || 'O WhatsApp bloqueou este número.', { duration: 20000 });
    fetchSessions();
  });
  useSocketEvent<{ message?: string }>('whatsapp:alert', (data) => {
    if (data?.message) toast.warning(data.message, { duration: 15000 });
  });
  useSocketEvent<{ message?: string }>('whatsapp:rate-warning', (data) => {
    if (data?.message) toast.info(data.message);
  });

  async function fetchSessions(first = false) {
    try {
      const { data } = await api.get('/whatsapp');
      const list: WASession[] = Array.isArray(data) ? data : [];
      setSessions(list);
      // Se já existe uma sessão aguardando QR, mostra o QR dela ao abrir a tela
      if (first) {
        const pending = list.find((s) => s.status === 'CONNECTING' && !isOfficial(s));
        if (pending) setQrSessionId(pending.id);
      }
    } catch (err) {
      if (first) toast.error(getErrorMessage(err, 'Não foi possível carregar os números.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    setChoosing(false);
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

  async function handleReconnect(session: WASession) {
    // Bloqueado/limitado: reconectar exige confirmação (insistir pode agravar a punição)
    const risky = session.status === 'BANNED' || isRestricted(session);
    if (risky) {
      const ok = await askConfirm({
        title: session.status === 'BANNED' ? 'Reconectar um número bloqueado?' : 'Reconectar um número limitado?',
        description: 'O WhatsApp aplicou uma restrição a este número. Antes, abra o WhatsApp no celular e confira os avisos. Tentar reconectar várias vezes pode piorar a situação.',
        confirmLabel: 'Reconectar mesmo assim',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await api.post(`/whatsapp/${session.id}/reconnect`, risky ? { confirm: true } : {});
      setQrSessionId(session.id);
      fetchSessions();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível reconectar.'));
    }
  }

  async function handleCloudTest(session: WASession) {
    setTestingId(session.id);
    try {
      const { data } = await api.post(`/whatsapp/cloud/${session.id}/test`);
      if (data.ok) toast.success('Conexão com a Meta funcionando!');
      else toast.error(data.error || 'O teste falhou.', { duration: 12000 });
      fetchSessions();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível testar.'));
    } finally {
      setTestingId(null);
    }
  }

  async function handleClearRestriction(session: WASession) {
    const ok = await askConfirm({
      title: 'Liberar os envios automáticos?',
      description: isOfficial(session)
        ? 'Só libere se a qualidade do número no Gerenciador do WhatsApp (Meta) estiver normal. A IA, as saudações e as campanhas voltam a enviar por este número.'
        : 'Só libere se você conferiu o WhatsApp no celular e não há aviso de restrição. A IA, as saudações e as campanhas voltam a enviar por este número.',
      confirmLabel: 'Liberar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/whatsapp/${session.id}/restriction`);
      toast.success('Envios automáticos liberados.');
      fetchSessions();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível liberar.'));
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

  async function handleDelete(id: string, official = false) {
    const ok = await askConfirm({
      title: 'Remover esta conexão?',
      description: official
        ? 'A conexão oficial será apagada do AtendIA (nada muda na sua conta da Meta). Para usar de novo, cadastre os dados outra vez.'
        : 'A conexão será apagada. Para usar este número de novo será preciso ler um novo QR Code.',
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
          <Button onClick={() => setChoosing(true)} loading={starting} disabled={!!qrSessionId}>
            <Plus size={18} />
            Conectar número
          </Button>
        ) : undefined}
      />

      <Modal open={choosing} onClose={() => setChoosing(false)} title="Como você quer conectar?" size="xl"
        description="Escolha o tipo de conexão do número. Você pode ter números dos dois tipos.">
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={handleConnect}
            className="text-left p-4 rounded-xl border-2 border-[var(--border-color)] hover:border-[var(--color-primary-500)] transition">
            <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)] mb-1"><QrCode size={20} /> Rápida (QR Code)</div>
            <p className="text-sm text-[var(--text-secondary)]">
              Use o WhatsApp do seu celular. Grátis, pronto em 1 minuto. Conexão não oficial: siga as boas práticas para evitar bloqueio.
            </p>
          </button>
          <button type="button" onClick={() => { setChoosing(false); setWizard({ session: null }); }}
            className="text-left p-4 rounded-xl border-2 border-[var(--border-color)] hover:border-[var(--color-primary-500)] transition">
            <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)] mb-1"><BadgeCheck size={20} /> Oficial (API da Meta)</div>
            <p className="text-sm text-[var(--text-secondary)]">
              Conexão oficial e estável, ideal para empresas e disparos. Exige conta no Meta Business, número dedicado e domínio
              com HTTPS. A Meta cobra por conversa iniciada pela empresa.
            </p>
          </button>
        </div>
      </Modal>

      <Modal open={!!wizard} onClose={() => { setWizard(null); fetchSessions(); }} size="xl"
        title={wizard?.session ? 'Conexão oficial (API da Meta)' : 'Conectar pela API oficial da Meta'}>
        {wizard && (
          <WhatsAppCloudWizard
            session={wizard.session}
            initialStep={wizard.step}
            onSaved={() => fetchSessions()}
            onClose={() => { setWizard(null); fetchSessions(); }}
          />
        )}
      </Modal>

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
          action={canManage ? { label: 'Conectar número', onClick: () => setChoosing(true) } : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => {
            const official = isOfficial(session);
            const config = official && session.status === 'DISCONNECTED'
              ? { ...STATUS_CONFIG.DISCONNECTED, label: 'Desconectado — teste a conexão' }
              : STATUS_CONFIG[session.status] || STATUS_CONFIG.DISCONNECTED;
            const connected = session.status === 'CONNECTED';
            const quality = official ? qualityBadge(session.cloud?.qualityRating ?? session.cloud?.quality) : null;
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
                        {session.phoneNumber || session.cloud?.displayPhoneNumber || 'Número ainda não conectado'}
                        {official && session.cloud?.verifiedName && (
                          <span className="ml-1.5 font-normal text-[var(--text-secondary)]">· {session.cloud.verifiedName}</span>
                        )}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        {official ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--color-info-bg)] text-[var(--color-info)]">
                            <BadgeCheck size={12} /> Oficial (Meta)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--surface-tertiary)] text-[var(--text-secondary)]">
                            <QrCode size={12} /> QR Code
                          </span>
                        )}
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${config.color}`}>{config.label}</span>
                        {quality && (
                          <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${quality.cls}`}>Qualidade: {quality.label}</span>
                        )}
                        {official && session.cloud?.messagingLimitTier && (
                          <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-[var(--surface-tertiary)] text-[var(--text-secondary)]">
                            Limite: {tierText(session.cloud.messagingLimitTier)}
                          </span>
                        )}
                        {isRestricted(session) && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
                            <ShieldAlert size={12} /> Limitado até {formatUntil(session.restrictedUntil!)}
                          </span>
                        )}
                      </div>
                      {isRestricted(session) && (
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {official ? 'A Meta limitou este número' : 'O WhatsApp limitou este número'}: IA, saudações e campanhas estão pausadas. Atendentes podem continuar respondendo.
                        </p>
                      )}
                      {official && session.cloud?.httpsReady === false && (
                        <p className="mt-1 text-xs text-[var(--color-warning)]">
                          Sem domínio com HTTPS: a Meta ainda não consegue entregar as mensagens recebidas. Veja em Configurar.
                        </p>
                      )}
                      {official && !!session.cloud?.invalidSignatures24h && (
                        <p className="mt-1 text-xs text-[var(--color-error)]">
                          Recebemos {session.cloud.invalidSignatures24h} evento(s) com assinatura inválida — confira o App Secret (em Configurar).
                        </p>
                      )}
                      {official && session.cloud?.lastTestOk === false && session.cloud.lastError && (
                        <p className="mt-1 text-xs text-[var(--color-error)]">{session.cloud.lastError}</p>
                      )}
                      {session.campaignsDisabledAt && (
                        <p className="mt-1 text-xs text-[var(--color-error)]">
                          Campanhas desligadas neste número (2 restrições em 30 dias).
                        </p>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      {official && (
                        <>
                          <Button variant="secondary" size="sm" onClick={() => handleCloudTest(session)} loading={testingId === session.id}>
                            Testar conexão
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setWizard({ session: session as CloudSession, step: 3 })} title="Configurar">
                            <Settings2 size={14} /> Configurar
                          </Button>
                        </>
                      )}
                      {!official && session.status === 'CONNECTING' && qrSessionId !== session.id && (
                        <Button variant="secondary" size="sm" onClick={() => setQrSessionId(session.id)}>
                          Ver QR Code
                        </Button>
                      )}
                      {connected && (
                        <Button variant="ghost" size="sm" onClick={() => handleDisconnect(session.id)} title="Desconectar" aria-label="Desconectar">
                          <WifiOff size={16} />
                        </Button>
                      )}
                      {isRestricted(session) && (
                        <Button variant="ghost" size="sm" onClick={() => handleClearRestriction(session)} title="Liberar envios automáticos">
                          <ShieldAlert size={14} /> Limpar restrição
                        </Button>
                      )}
                      {!official && (session.status === 'DISCONNECTED' || session.status === 'BANNED') && (
                        <Button variant="secondary" size="sm" onClick={() => handleReconnect(session)}>
                          <RefreshCw size={14} /> Reconectar
                        </Button>
                      )}
                      {!connected && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(session.id, official)} title="Remover" aria-label="Remover conexão">
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
