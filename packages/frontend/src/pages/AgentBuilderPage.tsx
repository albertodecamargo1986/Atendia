import { useState, useEffect } from 'react';
import api from '../services/api';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Bot, Sparkles, MessageSquare, Mic, Clock, Volume2 } from 'lucide-react';

const MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', desc: 'Rápido e econômico' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', desc: 'Mais inteligente' },
  { value: 'claude-3-haiku', label: 'Claude Haiku 4.5', provider: 'Anthropic', desc: 'Rápido e preciso' },
  { value: 'claude-3-sonnet', label: 'Claude Sonnet 4', provider: 'Anthropic', desc: 'Equilibrado e versátil' },
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

  useEffect(() => {
    if (isEditing) {
      api.get(`/agents/${id}`).then(({ data }) => {
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
      }).catch(() => navigate('/agents'));
    }
  }, [id]);

  useEffect(() => {
    api.get('/voice-profiles').then(({ data }) => {
      setVoiceProfiles(data.data || []);
    }).catch(() => {});
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
      navigate('/agents');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar agente');
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
      await api.post(`/agents/${id}/activate`);
      const { data } = await api.post(`/agents/${id}/test`, { message: testMessage });
      setTestResponse(data.response || data);
    } catch (err: any) {
      setTestResponse('Erro: ' + (err.response?.data?.error || err.message));
    } finally {
      setTesting(false);
    }
  }

  function formatDelay(ms: number) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => navigate('/agents')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={16} /> Voltar para Agentes
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isEditing ? 'Editar Agente' : 'Novo Agente'}
      </h1>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Bot size={20} className="text-indigo-600" /> Informações Básicas
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Agente *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={2}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                placeholder="Ex: Atendente Suporte" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                placeholder="Ex: Atende dúvidas sobre produtos" />
            </div>
          </div>
        </div>

        {/* Model Config */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Sparkles size={20} className="text-indigo-600" /> Modelo de IA
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm">
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Temperatura: {temperature.toFixed(1)}</label>
              <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full mt-2" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Preciso</span><span>Criativo</span>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tom de Voz</label>
              <select value={toneOfVoice} onChange={(e) => setToneOfVoice(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm">
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm">
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Humanização */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock size={20} className="text-indigo-600" /> Humanização do Atendimento
          </h2>
          <p className="text-sm text-gray-500 mb-4">Configure o tempo de resposta e o envio de áudios para que o atendimento pareça mais humano.</p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tempo de resposta mínimo: {formatDelay(responseDelayMinMs)}
              </label>
              <input type="range" min="500" max="5000" step="100" value={responseDelayMinMs}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setResponseDelayMinMs(v);
                  if (v > responseDelayMaxMs) setResponseDelayMaxMs(v);
                }}
                className="w-full" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0.5s (rápido)</span><span>5s (natural)</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tempo de resposta máximo: {formatDelay(responseDelayMaxMs)}
              </label>
              <input type="range" min={responseDelayMinMs} max="10000" step="100" value={responseDelayMaxMs}
                onChange={(e) => setResponseDelayMaxMs(parseInt(e.target.value))}
                className="w-full" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{formatDelay(responseDelayMinMs)}</span><span>10s (pausa longa)</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequência de áudio: {sendAudioFrequency === 0 ? 'Desativado' : `A cada ${sendAudioFrequency} mensagens`}
              </label>
              <input type="range" min="0" max="10" step="1" value={sendAudioFrequency}
                onChange={(e) => setSendAudioFrequency(parseInt(e.target.value))}
                className="w-full" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0 = só texto</span><span>1 = toda mensagem</span><span>10 = raramente</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">O agente enviará uma nota de voz a cada N mensagens de resposta, tornando o atendimento mais humano.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Volume2 size={14} /> Voz do Agente
              </label>
              <select value={voiceProfileId} onChange={(e) => setVoiceProfileId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm">
                <option value="">Nenhuma (só texto)</option>
                {voiceProfiles.map((vp) => (
                  <option key={vp.id} value={vp.id}>{vp.name} ({vp.provider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'})</option>
                ))}
              </select>
              {voiceProfiles.length === 0 && sendAudioFrequency > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Configure um perfil de voz em Configurações &gt; Vozes para usar áudios personalizados. Sem perfil, será usada a voz padrão da OpenAI.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Prompt */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MessageSquare size={20} className="text-indigo-600" /> Prompt do Sistema
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instruções para o agente *</label>
            <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} required minLength={10} rows={6}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm font-mono"
              placeholder="Você é um atendente de suporte da empresa X. Responda com empatia, seja objetivo e sempre pergunte se o cliente precisa de mais ajuda..." />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Instruções adicionais (opcional)</label>
            <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} rows={3}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm font-mono"
              placeholder="Ex: Sempre pergunte o CPF do cliente antes de consultar dados..." />
          </div>
        </div>

        {/* Test (only when editing) */}
        {isEditing && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Testar Agente</h2>
            <div className="flex gap-2">
              <input type="text" value={testMessage} onChange={(e) => setTestMessage(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                placeholder="Digite uma mensagem de teste..." />
              <button onClick={handleTest} disabled={testing || !testMessage}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
                {testing ? 'Testando...' : 'Testar'}
              </button>
            </div>
            {testResponse && (
              <div className="mt-3 p-4 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">{testResponse}</div>
            )}
          </div>
        )}

        {/* Save */}
        <div className="flex justify-end gap-3">
          <button onClick={() => navigate('/agents')} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !name || !systemPrompt}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar Agente'}
          </button>
        </div>
      </div>
    </div>
  );
}
