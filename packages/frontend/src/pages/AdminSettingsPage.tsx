import { useState, useEffect } from 'react';
import api from '../services/api';
import { Settings, Save, Loader2, CheckCircle, X, Eye, EyeOff } from 'lucide-react';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [chaveForm, setChaveForm] = useState({ provider: 'OPENAI', keyValue: '' });
  const [showKey, setShowKey] = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/settings');
      setSettings(data);
    } catch { setError('Erro ao carregar configurações'); }
    finally { setLoading(false); }
  }

  async function handleAddKey(e: React.FormEvent) {
    e.preventDefault();
    if (!chaveForm.keyValue.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/settings/api-keys', chaveForm);
      setChaveForm({ provider: 'OPENAI', keyValue: '' });
      setSuccess('Chave de API adicionada');
    } catch { setError('Erro ao adicionar chave'); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
          <Settings size={20} className="text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Configurações do Admin</h1>
          <p className="text-sm text-[var(--text-secondary)]">Configurações globais do sistema</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')}><X size={16} /></button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg flex items-center gap-2">
          <CheckCircle size={16} /> {success}
        </div>
      )}

      <div className="grid gap-6">
        {/* Resumo do Sistema */}
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Resumo do Sistema</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Tenants', value: settings?.tenantsCount || 0 },
              { label: 'Planos', value: settings?.planDistribution?.map((p: any) => `${p.plan}: ${p._count}`).join(', ') || '-' },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-lg bg-[var(--surface-secondary)]">
                <p className="text-xs text-[var(--text-tertiary)]">{item.label}</p>
                <p className="text-lg font-bold text-[var(--text-primary)] mt-1">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Adicionar Chave de API */}
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Adicionar Chave de API</h2>
          <form onSubmit={handleAddKey} className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Provedor</label>
              <select value={chaveForm.provider} onChange={e => setChaveForm({...chaveForm, provider: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                <option value="OPENAI">OpenAI</option>
                <option value="ANTHROPIC">Anthropic</option>
                <option value="ELEVENLABS">ElevenLabs</option>
              </select>
            </div>
            <div className="flex-[2]">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Chave</label>
              <div className="relative">
                <input type={showKey ? 'text' : 'password'} value={chaveForm.keyValue}
                  onChange={e => setChaveForm({...chaveForm, keyValue: e.target.value})}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={saving || !chaveForm.keyValue.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Adicionar
            </button>
          </form>
        </div>

        {/* Informações do Ambiente */}
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Informações do Ambiente</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {[
              { label: 'Node.js', value: '22 Alpine' },
              { label: 'Banco', value: 'PostgreSQL' },
              { label: 'Cache', value: 'Redis' },
              { label: 'Frontend', value: 'React + Vite' },
              { label: 'Container', value: 'Docker' },
              { label: 'Proxy', value: 'Nginx' },
            ].map(info => (
              <div key={info.label} className="p-3 rounded-lg bg-[var(--surface-secondary)]">
                <p className="text-xs text-[var(--text-tertiary)]">{info.label}</p>
                <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5">{info.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
