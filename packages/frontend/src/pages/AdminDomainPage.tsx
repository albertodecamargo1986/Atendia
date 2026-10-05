import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Globe, Lock, LockOpen, Server, Copy, Search, CheckCircle2, XCircle, Loader2, ExternalLink, RefreshCw,
} from 'lucide-react';
import api from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { useAuthStore } from '../stores/auth';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { askConfirm } from '../components/ui/ConfirmDialog';

interface DomainRequest {
  domain: string;
  email: string;
  requestedBy: string;
  requestedAt: string;
}

interface DomainStatus {
  state: 'applied' | 'error' | 'pending';
  message: string;
  domain: string | null;
  appliedAt: string | null;
}

interface DomainInfo {
  publicUrl: string | null;
  isHttps: boolean;
  serverIp: string | null;
  currentDomain: string | null;
  request: DomainRequest | null;
  status: DomainStatus | null;
  controlDirReady: boolean;
  webhookBaseUrl: string | null;
}

interface DnsResult {
  ok: boolean;
  domain: string;
  resolvedIps: string[];
  serverIp: string | null;
  message: string;
}

const POLL_MS = 10_000;

/** Mesma normalização do backend (só para comparar com o resultado do DNS). */
function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/\.$/, '');
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR');
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado`);
  } catch {
    toast.error('Não consegui copiar. Selecione o texto e copie manualmente.');
  }
}

export default function AdminDomainPage() {
  const userEmail = useAuthStore((s) => s.user?.email ?? '');
  const [info, setInfo] = useState<DomainInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [offline, setOffline] = useState(false);
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [dns, setDns] = useState<DnsResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Último domínio pedido nesta tela (para mostrar o link mesmo se o painel sair do ar)
  const lastRequested = useRef<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get<DomainInfo>('/admin/domain');
      setInfo(data);
      setLoadError('');
      setOffline(false);
      if (data.request) lastRequested.current = data.request.domain;
    } catch (err) {
      if (silent) {
        // Durante a troca o painel antigo sai do ar: isso é esperado.
        setOffline(true);
      } else {
        setLoadError(getErrorMessage(err, 'Não consegui carregar a situação do domínio.'));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!email && userEmail) setEmail(userEmail);
  }, [userEmail, email]);

  const pending = !!info?.request;
  const pollActive = pending || offline || info?.status?.state === 'pending';

  // Atualiza sozinho a cada 10s enquanto houver pedido pendente
  useEffect(() => {
    if (!pollActive) return;
    const id = window.setInterval(() => { void load(true); }, POLL_MS);
    return () => window.clearInterval(id);
  }, [pollActive, load]);

  const normalized = useMemo(() => normalizeDomain(domain), [domain]);
  const dnsOk = !!dns && dns.ok && dns.domain === normalized;

  async function checkDns() {
    if (!normalized) { toast.error('Digite o domínio primeiro.'); return; }
    setChecking(true);
    setDns(null);
    try {
      const { data } = await api.post<DnsResult>('/admin/domain/check-dns', { domain });
      setDns(data);
      if (data.ok) toast.success('DNS conferido: o domínio aponta para este servidor.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não consegui verificar o DNS.'));
    } finally {
      setChecking(false);
    }
  }

  async function applyDomain() {
    if (!dnsOk) return;
    const target = dns!.domain;
    const confirmed = await askConfirm({
      title: `Aplicar o domínio ${target}?`,
      description:
        `Em até 1 minuto o servidor vai trocar o endereço do painel. Durante a troca o painel fica FORA DO AR por cerca de 1 minuto ` +
        `(o WhatsApp continua conectado). Depois disso, acesse pelo novo endereço https://${target} e entre de novo com seu e-mail e senha. ` +
        `O endereço antigo (${info?.publicUrl ?? 'pelo IP'}) deixa de funcionar.`,
      confirmLabel: 'Aplicar domínio',
      cancelLabel: 'Agora não',
    });
    if (!confirmed) return;
    setApplying(true);
    try {
      await api.post('/admin/domain/apply', { domain: target, email });
      lastRequested.current = target;
      toast.success('Pedido enviado! Aguarde cerca de 1 minuto.');
      await load(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não consegui registrar o pedido.'));
    } finally {
      setApplying(false);
    }
  }

  async function cancelRequest() {
    const ok = await askConfirm({ title: 'Cancelar o pedido de domínio?', confirmLabel: 'Cancelar pedido', cancelLabel: 'Voltar', danger: true });
    if (!ok) return;
    setCancelling(true);
    try {
      const { data } = await api.delete<{ cancelled: boolean; message: string }>('/admin/domain/request');
      toast.success(data.message);
      lastRequested.current = null;
      await load(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não consegui cancelar o pedido.'));
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--text-secondary)]">
        <Loader2 className="animate-spin mr-2" size={20} /> Carregando...
      </div>
    );
  }

  const serverIp = info?.serverIp ?? null;
  const status = info?.status ?? null;
  const appliedDomain = status?.state === 'applied' ? status.domain : null;
  const newAddress = lastRequested.current ? `https://${lastRequested.current}` : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Domínio e HTTPS"
        description="Dê um nome ao endereço do painel (ex.: minhaempresa.duckdns.org) e ganhe o cadeado de segurança (HTTPS). O HTTPS é obrigatório para a API oficial do WhatsApp (Meta) e para o Mercado Pago."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw size={14} /> Atualizar
          </Button>
        }
      />

      {loadError && <Alert variant="error" title="Erro">{loadError}</Alert>}

      {/* ── Situação atual ── */}
      <Card>
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">Situação atual</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-[var(--text-tertiary)] mb-1 flex items-center gap-1"><Globe size={14} /> Endereço do painel</p>
            <p className="text-sm font-medium text-[var(--text-primary)] break-all">{info?.publicUrl || 'não configurado'}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-tertiary)] mb-1">Cadeado (HTTPS)</p>
            {info?.isHttps ? (
              <p className="text-sm font-medium text-[var(--color-success)] flex items-center gap-1"><Lock size={16} /> Sim</p>
            ) : (
              <p className="text-sm font-medium text-[var(--color-warning)] flex items-center gap-1"><LockOpen size={16} /> Não</p>
            )}
          </div>
          <div>
            <p className="text-xs text-[var(--text-tertiary)] mb-1 flex items-center gap-1"><Server size={14} /> IP do servidor</p>
            {serverIp ? (
              <p className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                <span className="font-mono">{serverIp}</span>
                <button
                  type="button"
                  onClick={() => void copyText(serverIp, 'IP')}
                  className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-secondary)]"
                  aria-label="Copiar IP do servidor"
                  title="Copiar"
                >
                  <Copy size={14} />
                </button>
              </p>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">não identificado</p>
            )}
          </div>
        </div>
        {info?.isHttps && info.webhookBaseUrl && (
          <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
            <p className="text-xs text-[var(--text-tertiary)] mb-1">Endereço do webhook da Meta (API oficial do WhatsApp)</p>
            <p className="text-sm font-mono text-[var(--text-primary)] break-all">{info.webhookBaseUrl}<span className="text-[var(--text-tertiary)]">(código da conexão)</span></p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">O endereço completo, pronto para copiar, aparece na tela do WhatsApp ao configurar a conexão oficial.</p>
          </div>
        )}
      </Card>

      {/* ── Pedido / status ── */}
      {pending && info?.request && (
        <Alert variant="info" title={`Aplicando o domínio ${info.request.domain}...`}>
          Pedido feito em {formatDate(info.request.requestedAt)}. O servidor aplica em até 1 minuto e o painel fica fora do ar por cerca de 1 minuto.
          {' '}Esta tela se atualiza sozinha a cada 10 segundos. Quando terminar, abra{' '}
          <a href={`https://${info.request.domain}`} className="underline font-medium" target="_blank" rel="noreferrer">https://{info.request.domain}</a>.
        </Alert>
      )}
      {pending && (
        <div className="flex justify-end -mt-3">
          <Button variant="ghost" size="sm" loading={cancelling} onClick={() => void cancelRequest()}>Cancelar pedido</Button>
        </div>
      )}

      {offline && newAddress && (
        <Alert variant="warning" title="O painel saiu do ar para trocar o endereço">
          Isso é esperado. Aguarde cerca de 1 minuto e abra o novo endereço:{' '}
          <a href={newAddress} className="underline font-medium">{newAddress}</a>
          {' '}(entre de novo com seu e-mail e senha).
        </Alert>
      )}
      {offline && !newAddress && (
        <Alert variant="warning" title="Sem resposta do servidor">
          Não consegui falar com o servidor agora. Tentando de novo a cada 10 segundos...
        </Alert>
      )}

      {!pending && status?.state === 'pending' && (
        <Alert variant="info" title="Aplicando o domínio no servidor...">
          {status.message || 'Aguarde cerca de 1 minuto.'}
        </Alert>
      )}
      {!pending && status?.state === 'error' && (
        <Alert variant="error" title={`Não foi possível aplicar ${status.domain ?? 'o domínio'}`}>
          {status.message || 'Erro desconhecido.'} {status.appliedAt ? `(${formatDate(status.appliedAt)})` : ''}
        </Alert>
      )}
      {!pending && appliedDomain && (
        <Alert variant="success" title="Domínio aplicado!">
          {status?.message ? `${status.message} ` : ''}Novo endereço:{' '}
          <a href={`https://${appliedDomain}`} className="underline font-medium">https://{appliedDomain}</a>
          {status?.appliedAt ? ` (${formatDate(status.appliedAt)})` : ''}
        </Alert>
      )}

      {info && !info.controlDirReady && (
        <Alert variant="warning" title="O servidor ainda não está preparado para trocar o domínio pelo painel">
          Peça para quem administra o servidor rodar no terminal (SSH):{' '}
          <code className="font-mono">sudo atendia update</code>. Depois volte aqui. Outra opção é configurar direto no servidor com{' '}
          <code className="font-mono">sudo atendia dominio SEU_DOMINIO</code>.
        </Alert>
      )}

      {/* ── Passo a passo ── */}
      <Card>
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">1. Consiga um domínio</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          O domínio precisa "apontar" para o IP deste servidor{serverIp ? ` (${serverIp})` : ''}. Escolha uma das opções:
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-[var(--border-color)] p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">Opção A — grátis com DuckDNS</p>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-[var(--text-secondary)]">
              <li>
                Abra{' '}
                <a href="https://www.duckdns.org" target="_blank" rel="noreferrer" className="text-[var(--color-primary-500)] underline inline-flex items-center gap-0.5">
                  duckdns.org <ExternalLink size={12} />
                </a>{' '}
                e entre com sua conta Google (ou outra das opções do site). É de graça.
              </li>
              <li>No campo <b>sub domain</b>, digite um nome (ex.: <i>minhaempresa</i>) e clique em <b>add domain</b>.</li>
              <li>
                Na linha do domínio criado, no campo <b>current ip</b>, apague o que estiver lá e cole o IP do servidor:{' '}
                <b className="font-mono">{serverIp ?? '(IP do servidor)'}</b>.
              </li>
              <li>Clique em <b>update ip</b> para salvar.</li>
              <li>Pronto: seu domínio é <b>minhaempresa.duckdns.org</b>. Digite-o abaixo.</li>
            </ol>
          </div>

          <div className="rounded-lg border border-[var(--border-color)] p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">Opção B — domínio próprio (ex.: Registro.br)</p>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-[var(--text-secondary)]">
              <li>No painel onde você comprou o domínio, abra a parte de <b>DNS</b> (ou "Zona DNS").</li>
              <li>
                Crie um registro do tipo <b>A</b>: nome <i>painel</i> (ou <i>@</i> para o domínio principal), valor{' '}
                <b className="font-mono">{serverIp ?? '(IP do servidor)'}</b>.
              </li>
              <li>Apague outros registros A/AAAA do mesmo nome que apontem para outro lugar.</li>
              <li>Salve. Pode levar de alguns minutos a algumas horas para valer.</li>
              <li>Seu domínio será, por exemplo, <b>painel.suaempresa.com.br</b>.</li>
            </ol>
          </div>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mt-3">
          Google Cloud: na sua VM, marque também "Permitir tráfego HTTPS" (Compute Engine › Instâncias de VM › Editar › Firewall).
        </p>
      </Card>

      {/* ── Formulário ── */}
      <Card>
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">2. Verifique e aplique</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Seu domínio"
            placeholder="minhaempresa.duckdns.org"
            value={domain}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void checkDns(); }}
            helperText="Sem http:// e sem barra no final."
            disabled={pending}
          />
          <Input
            label="E-mail para o certificado"
            type="email"
            placeholder="voce@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            helperText="Recebe avisos do Let's Encrypt (quem emite o cadeado). Não é público."
            disabled={pending}
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="secondary" onClick={() => void checkDns()} loading={checking} disabled={!normalized || pending}>
            <Search size={16} /> Verificar DNS
          </Button>
          <Button onClick={() => void applyDomain()} loading={applying} disabled={!dnsOk || !email.trim() || pending || !info?.controlDirReady}>
            <Lock size={16} /> Aplicar domínio
          </Button>
        </div>

        {dns && dns.domain === normalized && (
          <div
            className={`mt-4 rounded-lg border p-4 text-sm ${
              dns.ok
                ? 'border-[var(--color-success-border)] bg-[var(--color-success-bg)]'
                : 'border-[var(--color-error-border)] bg-[var(--color-error-bg)]'
            }`}
            role="status"
          >
            <p className={`font-semibold flex items-center gap-2 ${dns.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
              {dns.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              {dns.ok ? 'O domínio aponta para este servidor' : 'O domínio ainda não aponta para este servidor'}
            </p>
            <p className="text-[var(--text-secondary)] mt-1">{dns.message}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-2">
              {dns.domain} → {dns.resolvedIps.length ? dns.resolvedIps.join(', ') : 'nenhum IP'} · IP do servidor: {dns.serverIp ?? '?'}
            </p>
            {!dns.ok && (
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                Acabou de salvar no DuckDNS ou no seu provedor? Espere 2 a 5 minutos e clique em "Verificar DNS" de novo.
              </p>
            )}
          </div>
        )}
        {!dnsOk && !pending && (
          <p className="text-xs text-[var(--text-tertiary)] mt-3">O botão "Aplicar domínio" só libera depois que o DNS for verificado com sucesso.</p>
        )}
      </Card>
    </div>
  );
}
