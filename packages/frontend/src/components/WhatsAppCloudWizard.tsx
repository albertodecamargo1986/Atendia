import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Copy, ExternalLink, Globe, KeyRound, Send, ShieldCheck, Webhook,
} from 'lucide-react';
import { toast } from 'sonner';

import api from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { useAuthStore } from '../stores/auth';

import { Button } from './ui/Button';
import { Input } from './ui/Input';

/** Resumo (sem segredos) que o servidor devolve da conexão oficial. */
export interface CloudInfo {
  phoneNumberId: string | null;
  wabaId: string | null;
  accessToken: { configured: boolean; last4: string | null };
  appSecret: { configured: boolean; last4: string | null };
  verifyToken: string | null;
  webhookUrl: string | null;
  httpsReady: boolean;
  publicUrl: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastError: string | null;
}

export interface CloudSession {
  id: string;
  status: string;
  phoneNumber: string | null;
  provider?: string;
  cloud?: CloudInfo;
}

interface Props {
  /** Sessão existente (editar/rever webhook/testar) ou null (novo cadastro) */
  session: CloudSession | null;
  /** Passo inicial ao abrir uma sessão existente */
  initialStep?: Step;
  onSaved?: (session: CloudSession) => void;
  onClose: () => void;
}

type Step = 1 | 2 | 3 | 4;

const QUALITY_TEXT: Record<string, { label: string; cls: string }> = {
  GREEN: { label: 'Alta', cls: 'bg-[var(--color-success-bg)] text-[var(--color-success)]' },
  YELLOW: { label: 'Média', cls: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]' },
  RED: { label: 'Baixa', cls: 'bg-[var(--color-error-bg)] text-[var(--color-error)]' },
};

export function qualityBadge(q: string | null | undefined) {
  if (!q) return null;
  return QUALITY_TEXT[q] || { label: q, cls: 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]' };
}

const TIER_TEXT: Record<string, string> = {
  TIER_50: '50 contatos/dia', TIER_250: '250 contatos/dia', TIER_1K: '1.000 contatos/dia', TIER_2K: '2.000 contatos/dia',
  TIER_10K: '10.000 contatos/dia', TIER_100K: '100.000 contatos/dia', TIER_UNLIMITED: 'sem limite diário',
};
export function tierText(t: string | null | undefined) {
  return t ? TIER_TEXT[t] || t : null;
}

function Where({ children }: { children: ReactNode }) {
  return (
    <details className="mt-1 text-xs text-[var(--text-secondary)]">
      <summary className="cursor-pointer text-[var(--color-primary-500)] select-none">Onde encontro?</summary>
      <div className="mt-1 pl-3 border-l-2 border-[var(--border-color)] space-y-1">{children}</div>
    </details>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-[var(--text-primary)] mb-1">{label}</p>
      <div className="flex gap-2">
        <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-secondary)] text-xs">{value}</code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(
              () => toast.success('Copiado!'),
              () => toast.error('Não foi possível copiar. Selecione e copie manualmente.'),
            );
          }}
        >
          <Copy size={14} /> Copiar
        </Button>
      </div>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[var(--color-primary-500)] hover:underline">
      {children} <ExternalLink size={11} />
    </a>
  );
}

/**
 * Assistente da conexão OFICIAL (API da Meta), para quem nunca mexeu com isso:
 * 1) pré-requisitos  2) dados da Meta  3) webhook  4) testar.
 */
export default function WhatsAppCloudWizard({ session: initial, initialStep, onSaved, onClose }: Props) {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [session, setSession] = useState<CloudSession | null>(initial);
  const [step, setStep] = useState<Step>(initialStep ?? (initial ? 3 : 1));
  const [setup, setSetup] = useState<{ httpsReady: boolean; publicUrl: string | null } | null>(null);
  const [form, setForm] = useState({ phoneNumberId: '', wabaId: '', accessToken: '', appSecret: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const cloud = session?.cloud;
  const editing = !!session;

  useEffect(() => {
    api.get('/whatsapp/cloud/setup-info')
      .then(({ data }) => setSetup(data))
      .catch(() => setSetup({ httpsReady: false, publicUrl: null }));
  }, []);

  useEffect(() => {
    if (initial?.cloud) {
      setForm({ phoneNumberId: initial.cloud.phoneNumberId || '', wabaId: initial.cloud.wabaId || '', accessToken: '', appSecret: '' });
    }
  }, [initial]);

  const httpsReady = cloud?.httpsReady ?? setup?.httpsReady ?? false;

  const domainAlert = !httpsReady && (
    <div className="flex gap-2 p-3 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-sm">
      <AlertTriangle size={18} className="shrink-0 mt-0.5 text-[var(--color-warning)]" />
      <div className="text-[var(--text-secondary)]">
        <strong className="text-[var(--text-primary)]">A Meta só envia mensagens para endereços com HTTPS.</strong>{' '}
        Cadastre seu domínio em{' '}
        {isSuperAdmin
          ? <Link to="/admin/domain" className="text-[var(--color-primary-500)] underline">Administração › Domínio e HTTPS</Link>
          : <strong>Administração › Domínio e HTTPS</strong>}{' '}
        para ativar.{!isSuperAdmin && ' Peça ao administrador do sistema.'} Você já pode salvar os dados e testar a conexão;
        o recebimento de mensagens começa assim que o domínio estiver ativo.
      </div>
    </div>
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = editing
        ? await api.patch(`/whatsapp/cloud/${session!.id}`, form)
        : await api.post('/whatsapp/cloud', form);
      setSession(data.session);
      onSaved?.(data.session);
      if (data.ok) {
        toast.success('Dados salvos e conexão com a Meta funcionando!');
      } else {
        toast.warning(data.error || 'Dados salvos, mas o teste com a Meta falhou. Confira os dados.', { duration: 12000 });
      }
      setForm((f) => ({ ...f, accessToken: '', appSecret: '' }));
      setStep(3);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!session) return;
    setTesting(true);
    try {
      const { data } = await api.post(`/whatsapp/cloud/${session.id}/test`);
      setSession(data.session);
      onSaved?.(data.session);
      if (data.ok) toast.success('Conexão com a Meta funcionando!');
      else toast.error(data.error || 'O teste falhou.', { duration: 12000 });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível testar.'));
    } finally {
      setTesting(false);
    }
  }

  async function handleSendTest(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSendingTest(true);
    try {
      const { data } = await api.post(`/whatsapp/cloud/${session.id}/test-message`, { to: testTo });
      toast.success(data.mode === 'template'
        ? 'Mensagem de teste enviada (modelo "hello_world", em inglês). Confira no celular.'
        : 'Mensagem de teste enviada. Confira no celular.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível enviar a mensagem de teste.'), { duration: 12000 });
    } finally {
      setSendingTest(false);
    }
  }

  const steps: Array<{ n: Step; label: string }> = [
    { n: 1, label: 'Antes de começar' },
    { n: 2, label: 'Dados da Meta' },
    { n: 3, label: 'Webhook' },
    { n: 4, label: 'Testar' },
  ];

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap items-center gap-1 text-xs">
        {steps.map((s, i) => {
          const enabled = s.n <= 2 || !!session;
          return (
            <li key={s.n} className="flex items-center gap-1">
              <button
                type="button"
                disabled={!enabled}
                onClick={() => setStep(s.n)}
                className={`px-2 py-1 rounded-full ${step === s.n
                  ? 'bg-[var(--color-primary-500)] text-white'
                  : 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]'} disabled:opacity-50`}
              >
                {s.n}. {s.label}
              </button>
              {i < steps.length - 1 && <ChevronRight size={12} className="text-[var(--text-tertiary)]" />}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
          {domainAlert}
          {httpsReady && (
            <p className="flex items-center gap-1.5 text-[var(--color-success)]">
              <CheckCircle2 size={16} /> Seu servidor já tem domínio com HTTPS ({setup?.publicUrl || cloud?.publicUrl}).
            </p>
          )}
          <p className="text-[var(--text-primary)] font-medium">Você vai precisar de:</p>
          <ul className="space-y-2">
            <li className="flex gap-2"><Globe size={16} className="shrink-0 mt-0.5" />
              <span><strong>Domínio com HTTPS</strong> no servidor do AtendIA (a Meta não aceita endereço por IP).</span></li>
            <li className="flex gap-2"><ShieldCheck size={16} className="shrink-0 mt-0.5" />
              <span><strong>Conta no Meta Business</strong> (Gerenciador de Negócios) —{' '}
                <ExtLink href="https://business.facebook.com/">business.facebook.com</ExtLink>.</span></li>
            <li className="flex gap-2"><KeyRound size={16} className="shrink-0 mt-0.5" />
              <span><strong>Um app da Meta com o produto WhatsApp</strong> — crie em{' '}
                <ExtLink href="https://developers.facebook.com/apps/">developers.facebook.com/apps</ExtLink> (tipo "Empresa") e
                adicione o produto "WhatsApp".</span></li>
            <li className="flex gap-2"><Send size={16} className="shrink-0 mt-0.5" />
              <span><strong>Um número dedicado</strong>: um número usado na API oficial não pode continuar no aplicativo
                WhatsApp do celular.</span></li>
          </ul>
          <p className="text-xs">
            A Meta cobra por conversa iniciada pela empresa (modelos de marketing/utilidade). Respostas dentro de 24 h da última
            mensagem do cliente são livres. Saiba mais em{' '}
            <ExtLink href="https://developers.facebook.com/docs/whatsapp/pricing">preços da Meta</ExtLink>.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => setStep(2)}>Continuar <ChevronRight size={16} /></Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={handleSave} className="space-y-3">
          {domainAlert}
          <div>
            <Input
              label="Phone Number ID (identificação do número)"
              value={form.phoneNumberId}
              onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value.replace(/\D/g, '') }))}
              placeholder="Ex.: 104589123456789"
              inputMode="numeric"
              required={!editing}
            />
            <Where>
              <p>No app da Meta: <strong>WhatsApp › Configuração da API</strong> (API Setup). Abaixo do seu número aparece
                "Identificação do número de telefone" (Phone number ID). Copie só os números.</p>
            </Where>
          </div>
          <div>
            <Input
              label="WABA ID (identificação da conta do WhatsApp Business)"
              value={form.wabaId}
              onChange={(e) => setForm((f) => ({ ...f, wabaId: e.target.value.replace(/\D/g, '') }))}
              placeholder="Ex.: 102938475610293"
              inputMode="numeric"
              required={!editing}
            />
            <Where>
              <p>Na mesma tela (<strong>WhatsApp › Configuração da API</strong>): "Identificação da conta do WhatsApp Business".
                Também aparece no <ExtLink href="https://business.facebook.com/wa/manage/home/">Gerenciador do WhatsApp</ExtLink>.</p>
            </Where>
          </div>
          <div>
            <Input
              label="Token de acesso permanente"
              type="password"
              autoComplete="off"
              value={form.accessToken}
              onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
              placeholder={cloud?.accessToken.configured ? `Configurado ${cloud.accessToken.last4 ?? ''} — deixe vazio para manter` : 'Começa com EAA...'}
              required={!editing}
            />
            <Where>
              <p>Use um token <strong>permanente</strong> (o token temporário da tela de teste expira em 24 h):</p>
              <p>1. Em <ExtLink href="https://business.facebook.com/settings/system-users">Configurações do negócio › Usuários do sistema</ExtLink>, crie um usuário do sistema (Admin).</p>
              <p>2. Clique em "Adicionar ativos", escolha o seu app e dê controle total.</p>
              <p>3. Clique em "Gerar novo token", escolha o app, validade "Nunca" e marque as permissões
                <code> whatsapp_business_messaging</code> e <code>whatsapp_business_management</code>.</p>
            </Where>
          </div>
          <div>
            <Input
              label="Chave secreta do app (App Secret)"
              type="password"
              autoComplete="off"
              value={form.appSecret}
              onChange={(e) => setForm((f) => ({ ...f, appSecret: e.target.value.trim() }))}
              placeholder={cloud?.appSecret.configured ? `Configurada ${cloud.appSecret.last4 ?? ''} — deixe vazio para manter` : '32 letras e números'}
              required={!editing}
            />
            <Where>
              <p>No app da Meta: <strong>Configurações do app › Básico</strong> › "Chave secreta do aplicativo" › "Mostrar".
                Ela serve para o AtendIA conferir que as mensagens vieram mesmo da Meta.</p>
            </Where>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            O token e a chave secreta ficam guardados com criptografia e nunca mais são mostrados — só os últimos 4 caracteres.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => (editing ? setStep(3) : setStep(1))}>Voltar</Button>
            <Button type="submit" loading={saving}>{editing ? 'Salvar e testar' : 'Salvar e testar conexão'}</Button>
          </div>
        </form>
      )}

      {step === 3 && session && (
        <div className="space-y-3 text-sm">
          {cloud?.webhookUrl ? (
            <>
              <p className="text-[var(--text-secondary)]">
                No app da Meta, abra <strong>WhatsApp › Configuração</strong> (Configuration) › Webhook › <strong>Editar</strong> e cole:
              </p>
              <CopyField label="URL de retorno (Callback URL)" value={cloud.webhookUrl} />
              {cloud.verifyToken && <CopyField label="Token de verificação (Verify token)" value={cloud.verifyToken} />}
              <div className="flex gap-2 p-3 rounded-lg bg-[var(--color-info-bg)] text-[var(--text-secondary)]">
                <Webhook size={16} className="shrink-0 mt-0.5" />
                <span>Clique em <strong>Verificar e salvar</strong>. Depois, em "Campos do webhook", clique em <strong>Assinar</strong> no
                  campo <code>messages</code>. Sem isso, as mensagens dos clientes não chegam.</span>
              </div>
            </>
          ) : (
            <>
              {domainAlert}
              {cloud?.verifyToken && (
                <p className="text-xs text-[var(--text-tertiary)]">
                  Assim que o domínio estiver ativo, a URL do webhook aparece aqui para copiar, junto com o token de verificação.
                </p>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}>Editar dados</Button>
            <Button onClick={() => setStep(4)}>Continuar <ChevronRight size={16} /></Button>
          </div>
        </div>
      )}

      {step === 4 && session && (
        <div className="space-y-4 text-sm">
          <div className="p-3 rounded-lg border border-[var(--border-color)] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-[var(--text-primary)]">Situação na Meta</p>
              <Button variant="secondary" size="sm" onClick={handleTest} loading={testing}>Testar conexão</Button>
            </div>
            {cloud?.lastTestedAt ? (
              cloud.lastTestOk ? (
                <div className="text-[var(--text-secondary)] space-y-0.5">
                  <p className="flex items-center gap-1.5 text-[var(--color-success)]"><CheckCircle2 size={15} /> Conectado</p>
                  {cloud.verifiedName && <p>Nome verificado: <strong>{cloud.verifiedName}</strong></p>}
                  {cloud.displayPhoneNumber && <p>Número: <strong>{cloud.displayPhoneNumber}</strong></p>}
                  {cloud.qualityRating && (
                    <p>Qualidade do número:{' '}
                      <span className={`px-2 py-0.5 rounded-full text-xs ${qualityBadge(cloud.qualityRating)!.cls}`}>{qualityBadge(cloud.qualityRating)!.label}</span>
                    </p>
                  )}
                  {cloud.messagingLimitTier && <p>Limite da Meta: {tierText(cloud.messagingLimitTier)}</p>}
                </div>
              ) : (
                <p className="text-[var(--color-error)]">{cloud.lastError || 'O último teste falhou.'}</p>
              )
            ) : (
              <p className="text-[var(--text-tertiary)]">Ainda não testado.</p>
            )}
          </div>

          <form onSubmit={handleSendTest} className="space-y-2">
            <p className="font-medium text-[var(--text-primary)]">Enviar mensagem de teste</p>
            <Input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value.replace(/[^\d+]/g, ''))}
              placeholder="Seu celular com DDI e DDD, ex.: 5511999998888"
              inputMode="tel"
              helperText='Se esse número não falou com você nas últimas 24 h, a Meta só permite modelo: vai o "hello_world" (em inglês).'
            />
            <div className="flex justify-end">
              <Button type="submit" variant="secondary" loading={sendingTest} disabled={testTo.replace(/\D/g, '').length < 10 || session.status !== 'CONNECTED'}>
                <Send size={14} /> Enviar teste
              </Button>
            </div>
          </form>
          <div className="flex justify-end">
            <Button onClick={onClose}>Concluir</Button>
          </div>
        </div>
      )}
    </div>
  );
}
