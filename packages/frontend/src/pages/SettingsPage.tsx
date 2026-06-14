import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/auth';
import { User, Building2, Shield, Save, RefreshCw, Eye, EyeOff, Smartphone, Key, CheckCircle, XCircle, Loader2, Trash2 } from 'lucide-react';
import api from '../services/api';

interface ApiKeyInfo {
  id: string;
  provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS';
  isValid: boolean;
  lastTestedAt: string | null;
}

export default function SettingsPage() {
  const { user, tenant, checkAuth } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [twoFAStatus, setTwoFAStatus] = useState<'idle' | 'setup' | 'enabling' | 'disabling'>('idle');
  const [twoFAQrUrl, setTwoFAQrUrl] = useState('');
  const [twoFASecret, setTwoFASecret] = useState('');
  const [twoFAToken, setTwoFAToken] = useState('');
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);

  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [elevenlabsKey, setElevenlabsKey] = useState('');
  const [savingKey, setSavingKey] = useState<'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS' | null>(null);
  const [testingKey, setTestingKey] = useState<'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS' | null>(null);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  async function fetchApiKeys() {
    try {
      const { data } = await api.get('/settings/api-keys');
      setApiKeys(data);
    } catch { /* ignore */ }
  }

  async function saveApiKey(provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS') {
    const key = provider === 'OPENAI' ? openaiKey : provider === 'ELEVENLABS' ? elevenlabsKey : anthropicKey;
    if (!key.trim()) return;
    setSavingKey(provider);
    setMessage(null);
    try {
      await api.post('/settings/api-keys', { provider, key: key.trim() });
      setMessage({ type: 'success', text: `API Key ${provider === 'OPENAI' ? 'OpenAI' : provider === 'ELEVENLABS' ? 'ElevenLabs' : 'Anthropic'} salva com sucesso!` });
      if (provider === 'OPENAI') setOpenaiKey('');
      else if (provider === 'ELEVENLABS') setElevenlabsKey('');
      else setAnthropicKey('');
      fetchApiKeys();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Erro ao salvar API Key' });
    } finally {
      setSavingKey(null);
    }
  }

  async function testApiKey(provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS') {
    setTestingKey(provider);
    setMessage(null);
    try {
      const { data } = await api.post('/settings/api-keys/test', { provider });
      if (data.valid) {
        setMessage({ type: 'success', text: `Key ${provider === 'OPENAI' ? 'OpenAI' : provider === 'ELEVENLABS' ? 'ElevenLabs' : 'Anthropic'} valida!` });
      } else {
        setMessage({ type: 'error', text: `Key invalida: ${data.error || 'verifique a chave'}` });
      }
      fetchApiKeys();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Erro ao testar' });
    } finally {
      setTestingKey(null);
    }
  }

  async function deleteApiKey(provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS') {
    if (!confirm(`Remover API Key ${provider}?`)) return;
    try {
      await api.delete(`/settings/api-keys/${provider}`);
      setMessage({ type: 'success', text: 'API Key removida' });
      fetchApiKeys();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Erro ao remover' });
    }
  }

  async function saveProfile() {
    if (!name.trim() || name === user?.name) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.patch('/users/profile/me', { name: name.trim() });
      await checkAuth();
      setMessage({ type: 'success', text: 'Nome atualizado com sucesso!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Erro ao atualizar nome' });
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    if (!currentPassword || !newPassword) return;
    setSavingPassword(true);
    setMessage(null);
    try {
      await api.patch('/users/profile/me', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setShowPasswordSection(false);
      setMessage({ type: 'success', text: 'Senha alterada com sucesso!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Erro ao alterar senha' });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handle2FASetup() {
    setTwoFAStatus('setup');
    setMessage(null);
    try {
      const { data } = await api.post('/2fa/setup');
      setTwoFASecret(data.secret);
      setTwoFAQrUrl(data.qrUrl);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Erro ao configurar 2FA' });
      setTwoFAStatus('idle');
    }
  }

  async function handle2FAEnable() {
    if (!twoFAToken) return;
    setTwoFAStatus('enabling');
    try {
      await api.post('/2fa/enable', { token: twoFAToken });
      setTwoFAEnabled(true);
      setTwoFAStatus('idle');
      setTwoFAToken('');
      setTwoFAQrUrl('');
      setTwoFASecret('');
      setMessage({ type: 'success', text: '2FA ativado com sucesso!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Codigo invalido' });
      setTwoFAStatus('setup');
    }
  }

  async function handle2FADisable() {
    if (!twoFAToken) return;
    setTwoFAStatus('disabling');
    try {
      await api.post('/2fa/disable', { token: twoFAToken });
      setTwoFAEnabled(false);
      setTwoFAStatus('idle');
      setTwoFAToken('');
      setMessage({ type: 'success', text: '2FA desativado.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Codigo invalido.' });
      setTwoFAStatus('idle');
    }
  }

  const openaiInfo = apiKeys.find(k => k.provider === 'OPENAI');
  const anthropicInfo = apiKeys.find(k => k.provider === 'ANTHROPIC');
  const elevenlabsInfo = apiKeys.find(k => k.provider === 'ELEVENLABS');

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Configuracoes</h1>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center justify-between ${
          message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-current opacity-50 hover:opacity-100">&times;</button>
        </div>
      )}

      <div className="space-y-6">

        {/* API Keys Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Key size={20} className="text-indigo-600" /> API Keys de IA
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Cole suas chaves de API para que os agentes usem seu proprio credito. Sem chave configurada, o sistema usa a chave global.
          </p>

          {/* OpenAI */}
          <div className="border border-gray-100 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-700 font-bold text-xs">GPT</div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">OpenAI</p>
                  <p className="text-xs text-gray-400">GPT-4o-mini, GPT-4o, etc.</p>
                </div>
              </div>
              {openaiInfo && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${openaiInfo.isValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {openaiInfo.isValid ? 'Valida' : 'Invalida'}
                  </span>
                  <button onClick={() => testApiKey('OPENAI')} disabled={testingKey === 'OPENAI'}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition" title="Testar">
                    {testingKey === 'OPENAI' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  </button>
                  <button onClick={() => deleteApiKey('OPENAI')}
                    className="p-1.5 rounded hover:bg-red-50 text-red-400 transition" title="Remover">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)}
                placeholder={openaiInfo ? 'sk-proj-... (salva)' : 'sk-proj-...'}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none" />
              <button onClick={() => saveApiKey('OPENAI')} disabled={savingKey === 'OPENAI' || !openaiKey.trim()}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 transition flex items-center gap-1.5">
                {savingKey === 'OPENAI' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>

          {/* Anthropic — separate block, not nested inside ElevenLabs */}
          <div className="border border-gray-100 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-orange-700 font-bold text-xs">CL</div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Anthropic</p>
                  <p className="text-xs text-gray-400">Claude Sonnet, Haiku, etc.</p>
                </div>
              </div>
              {anthropicInfo && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${anthropicInfo.isValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {anthropicInfo.isValid ? 'Valida' : 'Invalida'}
                  </span>
                  <button onClick={() => testApiKey('ANTHROPIC')} disabled={testingKey === 'ANTHROPIC'}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition" title="Testar">
                    {testingKey === 'ANTHROPIC' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  </button>
                  <button onClick={() => deleteApiKey('ANTHROPIC')}
                    className="p-1.5 rounded hover:bg-red-50 text-red-400 transition" title="Remover">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)}
                placeholder={anthropicInfo ? 'sk-ant-... (salva)' : 'sk-ant-...'}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none" />
              <button onClick={() => saveApiKey('ANTHROPIC')} disabled={savingKey === 'ANTHROPIC' || !anthropicKey.trim()}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 transition flex items-center gap-1.5">
                {savingKey === 'ANTHROPIC' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>

          {/* ElevenLabs — separate block */}
          <div className="border border-gray-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-700 font-bold text-xs">11</div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">ElevenLabs</p>
                  <p className="text-xs text-gray-400">TTS e clonagem de voz</p>
                </div>
              </div>
              {elevenlabsInfo && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${elevenlabsInfo.isValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {elevenlabsInfo.isValid ? 'Valida' : 'Invalida'}
                  </span>
                  <button onClick={() => testApiKey('ELEVENLABS')} disabled={testingKey === 'ELEVENLABS'}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition" title="Testar">
                    {testingKey === 'ELEVENLABS' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  </button>
                  <button onClick={() => deleteApiKey('ELEVENLABS')}
                    className="p-1.5 rounded hover:bg-red-50 text-red-400 transition" title="Remover">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input type="password" value={elevenlabsKey} onChange={e => setElevenlabsKey(e.target.value)}
                placeholder={elevenlabsInfo ? 'xl_... (salva)' : 'xl_...'}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none" />
              <button onClick={() => saveApiKey('ELEVENLABS')} disabled={savingKey === 'ELEVENLABS' || !elevenlabsKey.trim()}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 transition flex items-center gap-1.5">
                {savingKey === 'ELEVENLABS' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>
        </div>

        {/* Profile */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User size={20} className="text-indigo-600" /> Perfil
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <div className="flex gap-2">
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                <button onClick={saveProfile} disabled={saving || name === user?.name || !name.trim()}
                  className="px-3 py-2.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 transition flex items-center gap-1.5">
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Salvar
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input type="email" defaultValue={user?.email || ''} disabled
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
              <input type="text" defaultValue={user?.role || ''} disabled
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500" />
            </div>
          </div>

          <div className="mt-4 border-t border-gray-100 pt-4">
            <button onClick={() => setShowPasswordSection(!showPasswordSection)}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              {showPasswordSection ? 'Cancelar' : 'Alterar senha'}
            </button>
            {showPasswordSection && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
                  <div className="relative">
                    <input type={showCurrent ? 'text' : 'password'} value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                  <div className="relative">
                    <input type={showNew ? 'text' : 'password'} value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <button type="button" onClick={() => setShowNew(!showNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <button onClick={savePassword} disabled={savingPassword || !currentPassword || !newPassword}
                    className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 transition flex items-center gap-1.5">
                    {savingPassword ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Alterar Senha
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Company */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Building2 size={20} className="text-indigo-600" /> Empresa
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input type="text" defaultValue={tenant?.name || ''} disabled
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input type="text" defaultValue={tenant?.slug || ''} disabled
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plano</label>
              <input type="text" defaultValue={tenant?.plan || 'FREE'} disabled
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500" />
            </div>
          </div>
        </div>

        {/* 2FA */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield size={20} className="text-indigo-600" /> Seguranca
          </h2>

          {twoFAEnabled ? (
            <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Shield size={20} className="text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-green-900">2FA ativada</p>
                  <p className="text-xs text-green-600">Sua conta esta mais segura</p>
                </div>
              </div>
              {twoFAStatus === 'idle' && (
                <button onClick={() => { setTwoFAStatus('disabling'); setTwoFAToken(''); }}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition">
                  Desativar
                </button>
              )}
            </div>
          ) : twoFAStatus === 'idle' ? (
            <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Smartphone size={20} className="text-gray-400" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Autenticacao de dois fatores</p>
                  <p className="text-xs text-gray-500">Adicione camada extra de seguranca</p>
                </div>
              </div>
              <button onClick={handle2FASetup}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition">
                Ativar 2FA
              </button>
            </div>
          ) : null}

          {twoFAStatus === 'setup' && twoFAQrUrl && (
            <div className="mt-4 p-6 border border-gray-200 rounded-lg bg-gray-50">
              <p className="text-sm text-gray-700 mb-4">Escaneie o QR Code com seu autenticador:</p>
              <div className="flex flex-col items-center gap-4">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFAQrUrl)}`}
                  alt="2FA QR Code" className="w-48 h-48 bg-white p-2 rounded-lg border" />
                <details className="w-full">
                  <summary className="text-xs text-gray-400 cursor-pointer">Copiar chave manualmente</summary>
                  <div className="mt-2 px-3 py-2 bg-gray-100 rounded text-sm font-mono text-gray-700 select-all break-all">
                    {twoFASecret}
                  </div>
                </details>
              </div>
              <div className="mt-4 flex gap-2">
                <input type="text" value={twoFAToken} onChange={(e) => setTwoFAToken(e.target.value)}
                  maxLength={6} placeholder="000000"
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-center font-mono tracking-widest focus:ring-2 focus:ring-indigo-500 outline-none" />
                <button onClick={handle2FAEnable} disabled={twoFAToken.length !== 6}
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition">
                  Verificar e Ativar
                </button>
              </div>
            </div>
          )}

          {twoFAStatus === 'disabling' && (
            <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <p className="text-sm text-gray-700 mb-3">Insira o codigo para desativar o 2FA:</p>
              <div className="flex gap-2">
                <input type="text" value={twoFAToken} onChange={(e) => setTwoFAToken(e.target.value)}
                  maxLength={6} placeholder="000000"
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-center font-mono tracking-widest focus:ring-2 focus:ring-indigo-500 outline-none" />
                <button onClick={handle2FADisable} disabled={twoFAToken.length !== 6}
                  className="px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 transition">
                  Desativar
                </button>
                <button onClick={() => { setTwoFAStatus('idle'); setTwoFAToken(''); }}
                  className="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
