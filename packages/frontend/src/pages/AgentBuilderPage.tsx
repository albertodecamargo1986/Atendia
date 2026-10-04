import { useState, useEffect } from 'react';
import api from '../services/api';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Bot, Sparkles, MessageSquare, Clock, Volume2 } from 'lucide-react';
import { getErrorMessage } from '../lib/errors';
import { toast } from 'sonner';
import { HelpTip } from '../components/ui/HelpTip';

// O rótulo precisa corresponder ao id real do modelo aceito pelo backend (agent.service.ts)
const MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini (OpenAI)', desc: 'Rápido e econômico — recomendado' },
  { value: 'gpt-4o', label: 'GPT-4o (OpenAI)', desc: 'Mais inteligente, custa mais' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini (OpenAI)', desc: 'Rápido e econômico' },
  { value: 'gpt-4.1', label: 'GPT-4.1 (OpenAI)', desc: 'Mais inteligente' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Anthropic)', desc: 'Rápido e preciso' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Anthropic)', desc: 'Equilibrado e versátil' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku (Anthropic, antigo)', desc: 'Modelo antigo' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet (Anthropic, antigo)', desc: 'Modelo antigo' },
];

const TONES = [
  { value: 'amigavel', label: 'Amigável' },
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'vendas', label: 'Vendas' },
];

const LANGUAGES = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'es-ES', label: 'Español' },
];

interface VoiceProfile {
  id: string;
  name: string;
  provider: string;
  voiceId: string;
  isDefault: boolean;
}

export default function AgentBuilderPage() {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [toneOfVoice, setToneOfVoice] = useState('amigavel');
  const [language, setLanguage] = useState('pt-BR');
  const [customPrompt, setCustomPrompt] = useState('');
  const [responseDelayMinMs, setResponseDelayMinMs] = useState(1000);
  const [responseDelayMaxMs, setResponseDelayMaxMs] = useState(4000);
  const [sendAudioFrequency, setSendAudioFrequency] = useState(3);
  const [voiceProfileId, setVoiceProfileId] = useState('');
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [testing, setTesting] = useState(false);
  const [loadingAgent, setLoadingAgent] = useState(isEditing);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (isEditing) {
      setLoadingAgent(true);
      api.get(`/agents/${id}`).then(({ data }) => {
        setIsActive(data.isActive !== false);
        setName(data.name);
        setDescription(data.description || '');
        setModel(data.model);
        setSystemPrompt(data.systemPrompt);
        setTemperature(data.temperature);
        setToneOfVoice(data.toneOfVoice);
        setLanguage(data.language);
        setCustomPrompt(data.customPrompt || '');
        setResponseDelayMinMs(data.responseDelayMinMs ?? 1000);
        setResponseDelayMaxMs(data.responseDelayMaxMs ?? 4000);
        setSendAudioFrequency(data.sendAudioFrequency ?? 3);
        setVoiceProfileId(data.voiceProfileId || '');
      }).catch((err) => {
        toast.error(getErrorMessage(err, 'Não foi possível abrir este agente.'));
        navigate('/ai/agents');
      }).finally(() => setLoadingAgent(false));
    }
  }, [id]);

  useEffect(() => {
    api.get('/voice-profiles').then(({ data }) => {
      setVoiceProfiles(data.data || (Array.isArray(data) ? data : []));
    }).catch(() => setVoiceProfiles([])); // Vozes podem não estar no plano
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        name, description: description || undefined, model, systemPrompt, temperature,
        toneOfVoice, language, customPrompt: customPrompt || undefined,
        responseDelayMinMs, responseDelayMaxMs, sendAudioFrequency,
        voiceProfileId: voiceProfileId || undefined,
      };
      if (isEditing) {
        await api.put(`/agents/${id}`, payload);
      } else {
        await api.post('/agents', payload);
      }
      toast.success(isEditing ? 'Agente salvo!' : 'Agente criado! Ative-o na lista para ele começar a responder.');
      navigate('/ai/agents');
    } catch (err: any) {
      const msg = getErrorMessage(err, 'Não foi possível salvar o agente.');
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!id || !testMessage) return;
    setTesting(true);
    setTestResponse('');
    try {
      if (isEditing) {
        await api.put(`/agents/${id}`, {
          name, description: description || undefined, model, systemPrompt, temperature,
          toneOfVoice, language, customPrompt: customPrompt || undefined,
          responseDelayMinMs, responseDelayMaxMs, sendAudioFrequency,
          voiceProfileId: voiceProfileId || undefined,
        });
      }
      const { data } = await api.post(`/agents/${id}/test`, { message: testMessage });
      setTestResponse(typeof data?.response === 'string' ? data.response : JSON.stringify(data?.response ?? data));
    } catch (err: any) {
      setTestResponse('Erro: ' + getErrorMessage(err));
    } finally {
      setTesting(false);
    }
  }

  function formatDelay(ms: number) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  if (loadingAgent) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
        <div className="h-6 w-40 bg-[var(--surface-tertiary)] rounded" />
        <div className="h-8 w-64 bg-[var(--surface-tertiary)] rounded" />
        <div className="h-40 bg-[var(--surface-tertiary)] rounded-xl" />
        <div className="h-40 bg-[var(--surface-tertiary)] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => navigate('/ai/agents')} className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4">
        <ArrowLeft size={16} /> Voltar para Agentes de IA
      </button>

      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-6">
        {isEditing ? 'Editar agente' : 'Novo agente'}
      </h1>

      {error && <div className="bg-[var(--color-error-bg)] border border-[var(--color-error-border)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Bot size={20} className="text-[var(--color-primary-500)]" /> Informações Básicas
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Nome do Agente *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={2}
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none transition text-sm"
                placeholder="Ex: Atendente Suporte" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Descrição</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none transition text-sm"
                placeholder="Ex: Atende dúvidas sobre produtos" />
            </div>
          </div>
        </div>

        {/* Model Config */}
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Sparkles size={20} className="text-[var(--color-primary-500)]" /> Modelo de IA
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Modelo</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none transition text-sm">
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-[var(--text-primary)] mb-1">Criatividade (temperatura): {temperature.toFixed(1)} <HelpTip text="Valores baixos (0 a 0,5) deixam as respostas mais previsíveis e fiéis às instruções — bom para atendimento. Valores altos deixam a IA mais criativa, mas ela pode inventar coisas. Recomendado: 0,5 a 0,7." /></label>
              <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full mt-2" />
              <div className="flex justify-between text-xs text-[var(--text-tertiary)] mt-1">
                <span>Preciso</span><span>Criativo</span>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Tom de Voz</label>
              <select value={toneOfVoice} onChange={(e) => setToneOfVoice(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none transition text-sm">
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Idioma</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none transition text-sm">
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Humanização */}
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Clock size={20} className="text-[var(--color-primary-500)]" /> Humanização do Atendimento
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">Configure o tempo de resposta e o envio de áudios para que o atendimento pareça mais humano.</p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Tempo de resposta mínimo: {formatDelay(responseDelayMinMs)}
              </label>
              <input type="range" min="500" max="5000" step="100" value={responseDelayMinMs}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setResponseDelayMinMs(v);
                  if (v > responseDelayMaxMs) setResponseDelayMaxMs(v);
                }}
                className="w-full" />
              <div className="flex justify-between text-xs text-[var(--text-tertiary)] mt-1">
                <span>0.5s (rápido)</span><span>5s (natural)</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Tempo de resposta máximo: {formatDelay(responseDelayMaxMs)}
              </label>
              <input type="range" min={responseDelayMinMs} max="10000" step="100" value={responseDelayMaxMs}
                onChange={(e) => setResponseDelayMaxMs(parseInt(e.target.value))}
                className="w-full" />
              <div className="flex justify-between text-xs text-[var(--text-tertiary)] mt-1">
                <span>{formatDelay(responseDelayMinMs)}</span><span>10s (pausa longa)</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Frequência de áudio: {sendAudioFrequency === 0 ? 'Desativado' : `A cada ${sendAudioFrequency} mensagens`}
              </label>
              <input type="range" min="0" max="10" step="1" value={sendAudioFrequency}
                onChange={(e) => setSendAudioFrequency(parseInt(e.target.value))}
                className="w-full" />
              <div className="flex justify-between text-xs text-[var(--text-tertiary)] mt-1">
                <span>0 = só texto</span><span>1 = toda mensagem</span><span>10 = raramente</span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">O agente enviará uma nota de voz a cada N mensagens de resposta, tornando o atendimento mais humano.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1 flex items-center gap-1">
                <Volume2 size={14} /> Voz do Agente
              </label>
              <select value={voiceProfileId} onChange={(e) => setVoiceProfileId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none transition text-sm">
                <option value="">Nenhuma (só texto)</option>
                {voiceProfiles.map((vp) => (
                  <option key={vp.id} value={vp.id}>{vp.name} ({vp.provider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'})</option>
                ))}
              </select>
              {voiceProfiles.length === 0 && sendAudioFrequency > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Configure um perfil de voz em Agentes de IA › Vozes para usar áudios personalizados. Sem perfil, será usada a voz padrão da OpenAI.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Prompt */}
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <MessageSquare size={20} className="text-[var(--color-primary-500)]" /> Instruções (prompt)
            <HelpTip text="O prompt é o texto que explica para a IA quem ela é e como deve atender. Escreva como se orientasse um funcionário novo: nome da empresa, o que vende, horários, tom de conversa e o que ela NÃO deve fazer." />
          </h2>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Instruções para o agente *</label>
            <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} required minLength={10} rows={6}
              className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none transition text-sm font-mono"
              placeholder="Você é um atendente de suporte da empresa X. Responda com empatia, seja objetivo e sempre pergunte se o cliente precisa de mais ajuda..." />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Instruções adicionais (opcional)</label>
            <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} rows={3}
              className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none transition text-sm font-mono"
              placeholder="Ex: Sempre pergunte o CPF do cliente antes de consultar dados..." />
          </div>
        </div>

        {/* Test (only when editing) */}
        {isEditing && (
          <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Testar agente</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              O teste salva as alterações acima e não envia nada para clientes. {!isActive && 'Este agente está desativado — o teste não o ativa.'}
            </p>
            <div className="flex gap-2">
              <input type="text" value={testMessage} onChange={(e) => setTestMessage(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none transition text-sm"
                placeholder="Digite uma mensagem de teste..." />
              <button onClick={handleTest} disabled={testing || !testMessage}
                className="px-4 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
                {testing ? 'Testando...' : 'Testar'}
              </button>
            </div>
            {testResponse && (
              <div className="mt-3 p-4 bg-[var(--surface-secondary)] rounded-lg text-sm text-[var(--text-primary)] whitespace-pre-wrap">{testResponse}</div>
            )}
          </div>
        )}

        {/* Save */}
        <div className="flex justify-end gap-3">
          <button onClick={() => navigate('/ai/agents')} className="px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] bg-[var(--surface-primary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--surface-secondary)] transition">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !name || !systemPrompt}
            className="flex items-center gap-2 px-6 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar agente'}
          </button>
        </div>
      </div>
    </div>
  );
}
