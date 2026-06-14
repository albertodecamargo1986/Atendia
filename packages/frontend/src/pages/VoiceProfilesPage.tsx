import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Mic, Plus, Trash2, Play, Volume2, AlertCircle, ExternalLink, Square, Upload } from 'lucide-react';

interface VoiceProfile {
  id: string;
  name: string;
  provider: string;
  voiceId: string;
  isDefault: boolean;
  sampleUrl?: string;
  _count?: { agents: number };
}

type Tab = 'list' | 'manual' | 'record';

export default function VoiceProfilesPage() {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('elevenlabs');
  const [voiceId, setVoiceId] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchProfiles(); }, []);

  async function fetchProfiles() {
    try {
      setLoading(true);
      const res = await api.get('/voice-profiles');
      setProfiles(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar perfis de voz');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName(''); setProvider('elevenlabs'); setVoiceId(''); setIsDefault(false);
    setTab('list'); setEditingId(null);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.patch(`/voice-profiles/${editingId}`, { name, provider, voiceId, isDefault });
      } else {
        await api.post('/voice-profiles', { name, provider, voiceId, isDefault });
      }
      resetForm();
      await fetchProfiles();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja remover este perfil de voz?')) return;
    try {
      await api.delete(`/voice-profiles/${id}`);
      await fetchProfiles();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao remover');
    }
  }

  async function handleTest(id: string) {
    setTesting(id);
    setTestAudioUrl(null);
    try {
      const res = await api.post(`/voice-profiles/${id}/test`);
      setTestAudioUrl(res.data.audioUrl);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao testar voz');
    } finally {
      setTesting(null);
    }
  }

  function startEdit(p: VoiceProfile) {
    setEditingId(p.id);
    setName(p.name);
    setProvider(p.provider);
    setVoiceId(p.voiceId);
    setIsDefault(p.isDefault);
    setTab('manual');
  }

  // --- Recording functions ---

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordings((prev) => [...prev, blob]);
        setRecordingTime(0);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch {
      setError('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function removeRecording(index: number) {
    setRecordings((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCloneFromRecordings() {
    if (recordings.length === 0 || !cloneName) {
      setError('Grave pelo menos 1 amostra de áudio e dê um nome');
      return;
    }
    setCloning(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('name', cloneName);
      recordings.forEach((blob, i) => {
        formData.append('files', blob, `amostra_${i + 1}.webm`);
      });
      await api.post('/voice-profiles/clone', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setRecordings([]);
      setCloneName('');
      setTab('list');
      await fetchProfiles();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao clonar voz');
    } finally {
      setCloning(false);
    }
  }

  async function handleCloneFromFiles() {
    if (uploadFiles.length === 0 || !cloneName) {
      setError('Selecione pelo menos 1 arquivo de áudio e dê um nome');
      return;
    }
    setCloning(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('name', cloneName);
      uploadFiles.forEach((file) => {
        formData.append('files', file);
      });
      await api.post('/voice-profiles/clone', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadFiles([]);
      setCloneName('');
      setTab('list');
      await fetchProfiles();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao clonar voz');
    } finally {
      setCloning(false);
    }
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Mic className="animate-pulse text-indigo-500" size={32} /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mic size={28} className="text-indigo-600" /> Perfis de Voz
          </h1>
          <p className="text-gray-500 mt-1">Configure vozes para o agente enviar áudios humanizados</p>
        </div>
        {tab === 'list' && (
          <div className="flex items-center gap-2">
            <button onClick={() => { resetForm(); setTab('record'); }}
              className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2.5 rounded-lg hover:bg-amber-700 transition text-sm font-medium">
              <Mic size={16} /> Gravar Voz
            </button>
            <button onClick={() => { resetForm(); setTab('manual'); }}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition text-sm font-medium">
              <Plus size={16} /> Adicionar Voz
            </button>
          </div>
        )}
        {tab !== 'list' && (
          <button onClick={() => { resetForm(); setRecordings([]); setUploadFiles([]); setCloneName(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 transition">
            Voltar para lista
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {/* === TAB: RECORD VOICE === */}
      {tab === 'record' && (
        <div className="space-y-6">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2 mb-3">
              <AlertCircle size={16} /> Como clonar sua voz
            </h3>
            <ol className="text-sm text-blue-700 space-y-2 list-decimal list-inside">
              <li>Dê um nome para esta voz</li>
              <li>Clique em <strong>Gravar</strong> e leia um texto naturalmente (mínimo 30 segundos)</li>
              <li>Grave de 1 a 5 amostras — ambientes silenciosos dão melhor resultado</li>
              <li>Clique em <strong>Clonar Voz</strong> — o áudio será enviado ao ElevenLabs</li>
              <li>Após a clonagem, a voz ficará disponível para seus agentes</li>
            </ol>
            <p className="text-xs text-amber-600 mt-3 font-medium">Importante: Solicite autorização antes de clonar qualquer voz.</p>
          </div>

          {/* Name */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Voz *</label>
            <input type="text" value={cloneName} onChange={(e) => setCloneName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              placeholder="Ex: Atendente Feminino" />
          </div>

          {/* Recorder */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Gravador de Áudio</h3>

            <div className="flex flex-col items-center gap-4">
              {!isRecording ? (
                <button onClick={startRecording}
                  className="w-20 h-20 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition group">
                  <Mic size={32} className="text-red-600 group-hover:scale-110 transition" />
                </button>
              ) : (
                <button onClick={stopRecording}
                  className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition animate-pulse">
                  <Square size={32} className="text-white" />
                </button>
              )}
              {isRecording && (
                <div className="text-center">
                  <p className="text-sm font-medium text-red-600">Gravando... {formatTime(recordingTime)}</p>
                  <p className="text-xs text-gray-400 mt-1">Clique no quadrado para parar</p>
                </div>
              )}
              {!isRecording && recordings.length === 0 && (
                <p className="text-sm text-gray-400">Clique no microfone para começar a gravar</p>
              )}
            </div>

            {/* List of recordings */}
            {recordings.length > 0 && (
              <div className="mt-6 space-y-2">
                <p className="text-sm font-medium text-gray-700">Amostras gravadas ({recordings.length}/5)</p>
                {recordings.map((blob, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <audio controls src={URL.createObjectURL(blob)} className="flex-1 h-8" />
                    <span className="text-xs text-gray-500">Amostra {i + 1}</span>
                    <button onClick={() => removeRecording(i)} className="p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upload option */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Ou envie arquivos de áudio</h3>
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition text-gray-600">
              <Upload size={16} /> Selecionar arquivos (WAV, MP3, OGG, M4A)
            </button>
            <input ref={fileInputRef} type="file" className="hidden" accept="audio/*" multiple
              onChange={(e) => {
                if (e.target.files) setUploadFiles(Array.from(e.target.files));
              }} />
            {uploadFiles.length > 0 && (
              <div className="mt-3 space-y-1">
                {uploadFiles.map((f, i) => (
                  <p key={i} className="text-xs text-gray-500">{f.name} ({(f.size / 1024 / 1024).toFixed(1)}MB)</p>
                ))}
              </div>
            )}
          </div>

          {/* Clone button */}
          <div className="flex justify-end">
            <button
              onClick={recordings.length > 0 ? handleCloneFromRecordings : uploadFiles.length > 0 ? handleCloneFromFiles : undefined}
              disabled={cloning || (!cloneName) || (recordings.length === 0 && uploadFiles.length === 0)}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
              {cloning ? 'Clonando voz...' : 'Clonar Voz no ElevenLabs'}
            </button>
          </div>
        </div>
      )}

      {/* === TAB: MANUAL ADD === */}
      {tab === 'manual' && (
        <div className="space-y-6">
          {/* Instructions card */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2 mb-3">
              <AlertCircle size={16} /> Como usar Voice ID existente
            </h3>
            <ol className="text-sm text-blue-700 space-y-2 list-decimal list-inside">
              <li>Crie uma conta em <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" className="underline font-medium">elevenlabs.io <ExternalLink size={12} className="inline" /></a></li>
              <li>Vá em <strong>Voice Lab</strong> &rarr; encontre o <strong>Voice ID</strong> da voz desejada</li>
              <li>Cole o Voice ID no campo abaixo</li>
            </ol>
            <div className="mt-2 text-xs text-blue-600">
              Para o <strong>OpenAI TTS</strong> (sem clonagem), use uma das vozes: <code className="bg-blue-100 px-1 rounded">alloy</code>, <code className="bg-blue-100 px-1 rounded">echo</code>, <code className="bg-blue-100 px-1 rounded">fable</code>, <code className="bg-blue-100 px-1 rounded">onyx</code>, <code className="bg-blue-100 px-1 rounded">nova</code>, <code className="bg-blue-100 px-1 rounded">shimmer</code>
            </div>
          </div>

          {/* Form */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? 'Editar Perfil de Voz' : 'Novo Perfil de Voz'}
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  placeholder="Ex: Atendente Feminino" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select value={provider} onChange={(e) => setProvider(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                  <option value="elevenlabs">ElevenLabs (com clonagem)</option>
                  <option value="openai">OpenAI TTS (vozes prontas)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Voice ID *</label>
                <input type="text" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono"
                  placeholder={provider === 'elevenlabs' ? 'Ex: 21m00Tvm4TlvDq8ikWAM' : 'Ex: alloy, nova, shimmer'} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" id="isDefault" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded" />
                <label htmlFor="isDefault" className="text-sm text-gray-700">Voz padrão</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">Cancelar</button>
              <button onClick={handleSave} disabled={saving || !name || !voiceId}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
                {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === TAB: LIST === */}
      {tab === 'list' && (
        <>
          {profiles.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Mic size={48} className="mx-auto text-gray-300 mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Nenhum perfil de voz</h2>
              <p className="text-gray-500 mb-6">Crie um perfil de voz para enviar áudios humanizados</p>
              <div className="flex justify-center gap-3">
                <button onClick={() => { resetForm(); setTab('record'); }}
                  className="px-4 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition">
                  <Mic size={16} className="inline mr-1" /> Gravar Voz
                </button>
                <button onClick={() => { resetForm(); setTab('manual'); }}
                  className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition">
                  <Plus size={16} className="inline mr-1" /> Adicionar Manual
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {profiles.map((p) => (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{p.name}</span>
                      {p.isDefault && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium">Padrão</span>}
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                        {p.provider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-mono mt-1">{p.voiceId}</p>
                    {p._count?.agents !== undefined && (
                      <p className="text-xs text-gray-400 mt-0.5">{p._count.agents} agente(s) usando</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleTest(p.id)} disabled={testing === p.id}
                      className="p-2 rounded-lg hover:bg-indigo-50 text-indigo-600 transition" title="Testar voz">
                      {testing === p.id ? <Volume2 size={18} className="animate-pulse" /> : <Play size={18} />}
                    </button>
                    <button onClick={() => startEdit(p)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition" title="Editar">
                      <Mic size={18} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition" title="Remover">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Test audio player */}
      {testAudioUrl && (
        <div className="fixed bottom-6 right-6 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-50">
          <p className="text-sm font-medium text-gray-700 mb-2">Preview da voz</p>
          <audio controls autoPlay src={testAudioUrl} className="w-64" />
          <button onClick={() => setTestAudioUrl(null)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-xs">X</button>
        </div>
      )}
    </div>
  );
}
