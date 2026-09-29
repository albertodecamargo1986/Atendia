import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Smartphone, Key, Bot, Clock, Send, Check, ChevronLeft, ChevronRight,
  MessageSquare, Store, Stethoscope, LifeBuoy, Sparkles, QrCode, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { getErrorMessage, getErrorStatus } from '../lib/errors';
import { fetchOnboardingProgress, ONBOARDING_DISMISSED_KEY, type OnboardingProgress } from '../lib/onboarding';
import { useAuthStore } from '../stores/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { HelpTip } from '../components/ui/HelpTip';
import WhatsAppQrConnect from '../components/WhatsAppQrConnect';
import ApiKeyField, { type ApiKeyInfo } from '../components/ApiKeyField';


interface AgentTemplate {
  key: string;
  name: string;
  description: string;
  systemPrompt: string;
  greeting?: string;
  toneOfVoice?: string;
  temperature?: number;
}

// Usados apenas se o servidor ainda não oferecer GET /agents/templates
const FALLBACK_TEMPLATES: AgentTemplate[] = [
  {
    key: 'loja',
    name: 'Atendente da Loja',
    description: 'Tira dúvidas sobre produtos, preços, entrega e formas de pagamento.',
    systemPrompt:
      'Você é o atendente virtual de uma loja. Seja simpático, use linguagem simples e respostas curtas. ' +
      'Ajude o cliente com dúvidas sobre produtos, preços, prazos de entrega, trocas e formas de pagamento. ' +
      'Se não souber uma informação, diga que vai chamar um atendente humano. Nunca invente preços ou prazos.',
  },
  {
    key: 'clinica',
    name: 'Recepção da Clínica',
    description: 'Informa horários, especialidades e ajuda a marcar consultas.',
    systemPrompt:
      'Você é a recepcionista virtual de uma clínica. Seja educada, acolhedora e objetiva. ' +
      'Informe horários de atendimento, especialidades e ajude o paciente a pedir um agendamento, ' +
      'coletando nome, telefone e o melhor dia/horário. Não dê orientações médicas: nesses casos, peça para falar com a equipe.',
  },
  {
    key: 'suporte',
    name: 'Suporte ao Cliente',
    description: 'Resolve dúvidas e problemas, e passa para a equipe quando necessário.',
    systemPrompt:
      'Você é o suporte ao cliente de uma empresa. Entenda o problema com perguntas simples, ' +
      'ofereça soluções passo a passo e confirme se deu certo. Se o problema não for resolvido, ' +
      'avise que vai transferir para um atendente humano.',
  },
  {
    key: 'generico',
    name: 'Assistente Geral',
    description: 'Um atendente educado para qualquer tipo de negócio.',
    systemPrompt:
      'Você é o assistente virtual de uma empresa. Responda com educação, de forma curta e clara, em português do Brasil. ' +
      'Se não souber a resposta, diga que vai chamar alguém da equipe.',
  },
];

const TEMPLATE_ICONS: Record<string, typeof Store> = {
  loja: Store, clinica: Stethoscope, suporte: LifeBuoy, generico: Sparkles,
};

const STEPS = [
  { id: 'company', title: 'Sua empresa', icon: Building2 },
  { id: 'whatsapp', title: 'WhatsApp', icon: Smartphone },
  { id: 'aiKey', title: 'Chave da IA', icon: Key },
  { id: 'agent', title: 'Agente', icon: Bot },
  { id: 'businessHours', title: 'Horário', icon: Clock },
  { id: 'test', title: 'Teste', icon: Send },
] as const;

type StepId = (typeof STEPS)[number]['id'];

interface WASession { id: string; status: string; phoneNumber?: string | null }

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, tenant, setTenant, checkAuth } = useAuthStore();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Passo 1
  const [myName, setMyName] = useState(user?.name || '');
  const [companyName, setCompanyName] = useState(tenant?.name || '');

  // Passo 2
  const [sessions, setSessions] = useState<WASession[]>([]);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);

  // Passo 3
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);

  // Passo 4
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [agentName, setAgentName] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('');

  // Passo 5
  const [hoursChoice, setHoursChoice] = useState<'24h' | 'comercial' | null>(null);

  const refreshProgress = useCallback(async () => {
    try {
      const p = await fetchOnboardingProgress();
      setProgress(p);
      return p;
    } catch {
      return null;
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get('/whatsapp');
      setSessions(Array.isArray(data) ? data : []);
    } catch { setSessions([]); }
  }, []);

  const loadApiKeys = useCallback(async () => {
    try {
      const { data } = await api.get('/settings/api-keys');
      setApiKeys(Array.isArray(data) ? data : []);
    } catch { setApiKeys([]); }
  }, []);

  useEffect(() => {
    (async () => {
      const p = await refreshProgress();
      await Promise.all([loadSessions(), loadApiKeys()]);
      try {
        const { data } = await api.get('/agents/templates');
        setTemplates(Array.isArray(data) && data.length ? data : FALLBACK_TEMPLATES);
      } catch {
        setTemplates(FALLBACK_TEMPLATES);
      }
      // Retoma no primeiro passo ainda não feito (depois do passo "empresa")
      if (p) {
        const order: StepId[] = ['whatsapp', 'aiKey', 'agent', 'businessHours'];
        const firstPending = order.find((id) => !p.steps[id as keyof typeof p.steps]);
        if (firstPending && firstPending !== 'whatsapp') {
          setStep(STEPS.findIndex((s) => s.id === firstPending));
        }
      }
      setLoading(false);
    })();
  }, [refreshProgress, loadSessions, loadApiKeys]);

  useEffect(() => { if (user?.name && !myName) setMyName(user.name); }, [user?.name, myName]);
  useEffect(() => { if (tenant?.name && !companyName) setCompanyName(tenant.name); }, [tenant?.name, companyName]);

  const connectedSession = sessions.find((s) => s.status === 'CONNECTED');
  const aiKeyReady = !!progress?.steps.aiKey || apiKeys.some((k) => k.isValid);
  const current = STEPS[step];

  function isDone(id: StepId): boolean {
    if (!progress) return false;
    if (id === 'whatsapp') return !!connectedSession || progress.steps.whatsapp;
    if (id === 'aiKey') return aiKeyReady;
    if (id === 'test') return false;
    return !!progress.steps[id];
  }

  function next() { setStep((s) => Math.min(s + 1, STEPS.length - 1)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  async function handleSkipAll() {
    setBusy(true);
    try {
      await api.post('/onboarding/skip');
    } catch {
      /* se o servidor falhar, ainda assim deixamos a pessoa usar o sistema nesta sessão */
    }
    sessionStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
    setTenant({ onboardingCompletedAt: new Date().toISOString() });
    setBusy(false);
    toast.info('Tudo bem! Você pode voltar ao assistente clicando no seu nome, no pé do menu, em "Assistente de configuração".');
    navigate('/');
  }

  async function handleFinish() {
    setBusy(true);
    try {
      await api.post('/onboarding/complete');
      setTenant({ onboardingCompletedAt: new Date().toISOString() });
      sessionStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
      toast.success('Configuração concluída! Bom atendimento.');
      navigate('/tickets');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível concluir. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  // ── Passo 1: nome ──
  async function saveCompanyStep() {
    const nameChanged = myName.trim() && myName.trim() !== user?.name;
    const companyChanged = companyName.trim().length >= 2 && companyName.trim() !== tenant?.name;
    if (nameChanged || companyChanged) {
      setBusy(true);
      try {
        if (nameChanged) await api.patch('/users/profile/me', { name: myName.trim() });
        if (companyChanged) {
          await api.patch('/onboarding/company', { name: companyName.trim() });
          setTenant({ name: companyName.trim() });
        }
        await checkAuth();
        toast.success('Dados salvos!');
      } catch (err) {
        toast.error(getErrorMessage(err, 'Não foi possível salvar os dados.'));
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    next();
  }

  // ── Passo 2: WhatsApp ──
  async function startWhatsApp() {
    setBusy(true);
    try {
      const reusable = sessions.find((s) => s.status === 'CONNECTING' || s.status === 'DISCONNECTED');
      if (reusable) {
        if (reusable.status === 'DISCONNECTED') await api.post(`/whatsapp/${reusable.id}/reconnect`);
        setQrSessionId(reusable.id);
      } else {
        const { data } = await api.post('/whatsapp/connect');
        setQrSessionId(data.id);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível gerar o QR Code.'));
    } finally {
      setBusy(false);
    }
  }

  // ── Passo 4: agente ──
  function chooseTemplate(t: AgentTemplate) {
    setSelectedTemplate(t);
    setAgentName(t.name);
    setAgentPrompt(t.systemPrompt);
  }

  async function createAgent() {
    if (!agentName.trim() || agentPrompt.trim().length < 10) {
      toast.error('Dê um nome ao agente e escreva as instruções (pelo menos 10 letras).');
      return;
    }
    setBusy(true);
    try {
      const hasOpenAI = apiKeys.some((k) => k.provider === 'OPENAI');
      const hasAnthropic = apiKeys.some((k) => k.provider === 'ANTHROPIC');
      const model = !hasOpenAI && hasAnthropic ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini';
      const { data: agent } = await api.post('/agents', {
        name: agentName.trim(),
        description: selectedTemplate?.description,
        model,
        systemPrompt: agentPrompt.trim(),
        temperature: typeof selectedTemplate?.temperature === 'number' ? selectedTemplate.temperature : 0.7,
        ...(selectedTemplate?.toneOfVoice ? { toneOfVoice: selectedTemplate.toneOfVoice } : {}),
      });
      await api.post(`/agents/${agent.id}/activate`);
      toast.success('Agente criado e ativado!');
      await refreshProgress();
      next();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível criar o agente.'));
    } finally {
      setBusy(false);
    }
  }

  // ── Passo 5: horário ──
  async function saveHours(choice: '24h' | 'comercial') {
    setBusy(true);
    setHoursChoice(choice);
    try {
      const days = [0, 1, 2, 3, 4, 5, 6];
      await Promise.all(days.map((d) => {
        const body = choice === '24h'
          ? { isOpen: true, openTime: '00:00', closeTime: '23:59' }
          : { isOpen: d >= 1 && d <= 5, openTime: '08:00', closeTime: '18:00' };
        return api.put(`/business-hours/${d}`, body);
      }));
      toast.success(choice === '24h' ? 'Atendimento 24 horas configurado!' : 'Horário comercial configurado!');
      await refreshProgress();
      next();
    } catch (err) {
      setHoursChoice(null);
      if (getErrorStatus(err) === 403) {
        toast.info('Horários personalizados não estão no seu plano. O AtendIA vai atender 24 horas.');
        next();
      } else {
        toast.error(getErrorMessage(err, 'Não foi possível salvar o horário.'));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-secondary)]">
        <div className="w-8 h-8 border-2 border-[var(--color-primary-500)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-secondary)] text-[var(--text-primary)]">
      {/* Topo */}
      <header className="bg-[var(--surface-primary)] border-b border-[var(--border-color)]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-500)] flex items-center justify-center">
              <MessageSquare size={16} className="text-white" />
            </div>
            <span className="font-bold">Configurar o AtendIA</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSkipAll} disabled={busy}>
            Pular por agora
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Etapas */}
        <ol className="flex items-center gap-1 sm:gap-2 mb-6 overflow-x-auto pb-1" aria-label="Etapas">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = isDone(s.id);
            const active = i === step;
            return (
              <li key={s.id} className="flex items-center gap-1 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`Etapa ${i + 1}: ${s.title}${done ? ' (concluída)' : ''}`}
                  className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    active
                      ? 'bg-[var(--color-primary-500)] text-white'
                      : done
                        ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                        : 'bg-[var(--surface-primary)] text-[var(--text-secondary)] border border-[var(--border-color)]'
                  }`}
                >
                  {done && !active ? <Check size={13} /> : <Icon size={13} />}
                  <span className="hidden sm:inline">{s.title}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
                {i < STEPS.length - 1 && <span className="w-2 sm:w-4 h-px bg-[var(--border-color)]" />}
              </li>
            );
          })}
        </ol>

        <section className="bg-[var(--surface-primary)] border border-[var(--border-color)] rounded-xl p-5 sm:p-8 shadow-card">
          <p className="text-xs font-medium text-[var(--text-tertiary)] mb-1">Etapa {step + 1} de {STEPS.length}</p>

          {current.id === 'company' && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold">Bem-vindo(a) ao AtendIA! 👋</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Em poucos minutos o seu WhatsApp vai responder clientes sozinho, com inteligência artificial.
                Vamos fazer juntos, passo a passo. Você pode pular e voltar depois quando quiser.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Seu nome" value={myName} onChange={(e) => setMyName(e.target.value)} />
                <Input label="Nome da empresa" value={companyName} onChange={(e) => setCompanyName(e.target.value)} helperText="É assim que sua empresa aparece no sistema." />
              </div>
              <div className="flex justify-end">
                <Button onClick={saveCompanyStep} loading={busy}>
                  Começar <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {current.id === 'whatsapp' && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold">Conecte o WhatsApp da empresa</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Use o celular com o número que seus clientes já conhecem. O WhatsApp continua funcionando
                normalmente no celular — o AtendIA apenas passa a responder também.
              </p>

              {connectedSession ? (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success-border)]">
                  <Check className="text-[var(--color-success)]" />
                  <p className="text-sm">WhatsApp conectado{connectedSession.phoneNumber ? `: ${connectedSession.phoneNumber}` : ''}.</p>
                </div>
              ) : qrSessionId ? (
                <WhatsAppQrConnect
                  sessionId={qrSessionId}
                  onConnected={() => {
                    toast.success('WhatsApp conectado!');
                    loadSessions();
                    refreshProgress();
                  }}
                />
              ) : (
                <div className="text-center py-6">
                  <Button size="lg" onClick={startWhatsApp} loading={busy}>
                    <QrCode size={18} /> Gerar QR Code
                  </Button>
                </div>
              )}

              <StepNav
                onBack={back}
                onNext={next}
                nextLabel={connectedSession ? 'Continuar' : 'Fazer depois'}
                nextVariant={connectedSession ? 'primary' : 'secondary'}
              />
            </div>
          )}

          {current.id === 'aiKey' && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold flex items-center gap-2">
                Chave da inteligência artificial
                <HelpTip text="A chave é um código que você gera no site da OpenAI. Ela permite que o AtendIA use o ChatGPT para responder seus clientes. O uso é cobrado pela OpenAI conforme o volume de mensagens." />
              </h1>
              {progress?.steps.aiKey && !apiKeys.length ? (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success-border)]">
                  <Check className="text-[var(--color-success)] shrink-0" />
                  <p className="text-sm">
                    Este servidor já tem uma chave de IA configurada. Você pode pular esta etapa.
                    Se preferir usar a sua própria chave, cole abaixo.
                  </p>
                </div>
              ) : (
                <div className="text-sm text-[var(--text-secondary)] space-y-2">
                  <p>Para conseguir sua chave (leva uns 3 minutos):</p>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Abra <a className="text-[var(--text-link)] underline" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com/api-keys</a> e entre (ou crie uma conta).</li>
                    <li>Em <strong>Billing</strong>, adicione um pouco de crédito (ex.: US$ 5).</li>
                    <li>Clique em <strong>Create new secret key</strong>, copie o código que começa com <code>sk-</code> e cole aqui.</li>
                  </ol>
                </div>
              )}
              <ApiKeyField
                provider="OPENAI"
                info={apiKeys.find((k) => k.provider === 'OPENAI')}
                hideDelete
                onChanged={async () => { await loadApiKeys(); await refreshProgress(); }}
              />
              {!aiKeyReady && (
                <p className="text-xs text-[var(--color-warning)] flex items-center gap-1">
                  <AlertTriangle size={13} /> Sem uma chave funcionando, o agente não consegue responder as mensagens.
                </p>
              )}
              <StepNav
                onBack={back}
                onNext={next}
                nextLabel={aiKeyReady ? 'Continuar' : 'Fazer depois'}
                nextVariant={aiKeyReady ? 'primary' : 'secondary'}
              />
            </div>
          )}

          {current.id === 'agent' && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold">Crie o seu atendente virtual</h1>
              {progress?.steps.agent && !selectedTemplate ? (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success-border)]">
                  <Check className="text-[var(--color-success)] shrink-0" />
                  <p className="text-sm">Você já tem um agente ativo. Pode continuar — ou escolher um modelo abaixo para criar outro.</p>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  Escolha o modelo que mais combina com o seu negócio. Depois você pode ajustar o nome e as instruções.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {templates.map((t) => {
                  const Icon = TEMPLATE_ICONS[t.key] || Sparkles;
                  const selected = selectedTemplate?.key === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => chooseTemplate(t)}
                      aria-pressed={selected}
                      className={`text-left p-4 rounded-lg border transition ${
                        selected
                          ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
                          : 'border-[var(--border-color)] hover:border-[var(--border-color-hover)] hover:bg-[var(--surface-secondary)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={18} className="text-[var(--color-primary-500)]" />
                        <span className="font-medium text-sm">{t.name}</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">{t.description}</p>
                    </button>
                  );
                })}
              </div>

              {selectedTemplate && (
                <div className="space-y-3 pt-2">
                  <Input label="Nome do agente" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
                  <div className="space-y-1.5">
                    <label htmlFor="onb-prompt" className="flex items-center gap-1 text-sm font-medium">
                      Instruções para a IA
                      <HelpTip text="Escreva como se estivesse orientando um funcionário novo: quem é a empresa, o que vende, como deve falar e o que NÃO deve fazer." />
                    </label>
                    <textarea
                      id="onb-prompt"
                      value={agentPrompt}
                      onChange={(e) => setAgentPrompt(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                    />
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Dica: acrescente informações da sua empresa (endereço, horários, produtos, preços).
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={createAgent} loading={busy}>
                      <Bot size={16} /> Criar e ativar agente
                    </Button>
                  </div>
                </div>
              )}

              <StepNav
                onBack={back}
                onNext={next}
                nextLabel={progress?.steps.agent ? 'Continuar' : 'Fazer depois'}
                nextVariant={progress?.steps.agent ? 'primary' : 'secondary'}
              />
            </div>
          )}

          {current.id === 'businessHours' && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold">Quando o AtendIA deve atender?</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Escolha uma opção. Você pode ajustar os horários dia a dia depois, em WhatsApp › Horário.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => saveHours('24h')}
                  disabled={busy}
                  className={`text-left p-5 rounded-lg border transition disabled:opacity-60 ${
                    hoursChoice === '24h' ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]' : 'border-[var(--border-color)] hover:bg-[var(--surface-secondary)]'
                  }`}
                >
                  <p className="font-semibold">24 horas</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">Responde a qualquer hora, todos os dias.</p>
                </button>
                <button
                  type="button"
                  onClick={() => saveHours('comercial')}
                  disabled={busy}
                  className={`text-left p-5 rounded-lg border transition disabled:opacity-60 ${
                    hoursChoice === 'comercial' ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]' : 'border-[var(--border-color)] hover:bg-[var(--surface-secondary)]'
                  }`}
                >
                  <p className="font-semibold">Comercial (seg–sex 8h–18h)</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">Fora desse horário, o cliente recebe um aviso.</p>
                </button>
              </div>
              <StepNav
                onBack={back}
                onNext={next}
                nextLabel={progress?.steps.businessHours ? 'Continuar' : 'Fazer depois'}
                nextVariant={progress?.steps.businessHours ? 'primary' : 'secondary'}
              />
            </div>
          )}

          {current.id === 'test' && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold">Hora do teste! 🎉</h1>
              <ChecklistSummary progress={progress} connected={!!connectedSession} aiKeyReady={aiKeyReady} />
              <div className="p-4 rounded-lg bg-[var(--color-info-bg)] border border-[var(--color-info-border)] text-sm space-y-2">
                <p className="font-medium">Como testar:</p>
                <ol className="list-decimal pl-5 space-y-1 text-[var(--text-secondary)]">
                  <li>Pegue <strong>outro celular</strong> (de um amigo ou pessoal).</li>
                  <li>Envie um <strong>“Oi”</strong> pelo WhatsApp para o número da empresa{connectedSession?.phoneNumber ? ` (${connectedSession.phoneNumber})` : ''}.</li>
                  <li>Em alguns segundos o agente responde. Você acompanha tudo na tela <strong>Conversas</strong>.</li>
                </ol>
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-between gap-2">
                <Button variant="secondary" onClick={back}><ChevronLeft size={16} /> Voltar</Button>
                <Button onClick={handleFinish} loading={busy}>
                  Concluir e ir para Conversas <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StepNav({ onBack, onNext, nextLabel, nextVariant = 'primary' }: {
  onBack: () => void; onNext: () => void; nextLabel: string; nextVariant?: 'primary' | 'secondary';
}) {
  return (
    <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 pt-2">
      <Button variant="ghost" onClick={onBack}><ChevronLeft size={16} /> Voltar</Button>
      <Button variant={nextVariant} onClick={onNext}>{nextLabel} <ChevronRight size={16} /></Button>
    </div>
  );
}

function ChecklistSummary({ progress, connected, aiKeyReady }: {
  progress: OnboardingProgress | null; connected: boolean; aiKeyReady: boolean;
}) {
  const items = [
    { label: 'WhatsApp conectado', done: connected || !!progress?.steps.whatsapp },
    { label: 'Chave da IA funcionando', done: aiKeyReady },
    { label: 'Agente ativo', done: !!progress?.steps.agent },
    { label: 'Horário de atendimento', done: !!progress?.steps.businessHours },
  ];
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2 text-sm">
          {i.done
            ? <Check size={16} className="text-[var(--color-success)]" />
            : <AlertTriangle size={16} className="text-[var(--color-warning)]" />}
          <span className={i.done ? '' : 'text-[var(--text-secondary)]'}>
            {i.label}{i.done ? '' : ' — pendente (você pode fazer depois)'}
          </span>
        </li>
      ))}
    </ul>
  );
}
