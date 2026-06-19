import { useState, useEffect } from 'react';
import api from '../services/api';
import { Shield, Save, Loader2, CheckCircle } from 'lucide-react';

const MODULES = [
  'dashboard', 'tickets', 'conversations', 'contacts', 'agents', 'queues', 'tags',
  'quickReplies', 'campaigns', 'voiceProfiles', 'webhooks', 'reports', 'internalChat',
  'knowledge', 'whatsapp', 'businessHours', 'team', 'license', 'settings', 'admin',
];

const ROLES = ['OWNER', 'ADMIN', 'SUPERVISOR', 'OPERATOR'];

const moduleLabels: Record<string, string> = {
  dashboard: 'Dashboard', tickets: 'Tickets', conversations: 'Conversas',
  contacts: 'Contatos', agents: 'Agentes', queues: 'Filas', tags: 'Tags',
  quickReplies: 'Respostas Rápidas', campaigns: 'Campanhas', voiceProfiles: 'Vozes',
  webhooks: 'Webhooks', reports: 'Relatórios', internalChat: 'Chat Interno',
  knowledge: 'Conhecimento', whatsapp: 'WhatsApp', businessHours: 'Horários',
  team: 'Equipe', license: 'Licença', settings: 'Configurações', admin: 'Admin',
};

interface Permission {
  id: string; tenantId: string; role: string; module: string;
  canRead: boolean; canWrite: boolean; canDelete: boolean;
}

export default function AdminPermissionsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchPermissions(); }, []);

  async function fetchPermissions() {
    try {
      const { data } = await api.get('/admin/permissions');
      setPermissions(data);
    } catch { setError('Erro ao carregar permissões'); }
    finally { setLoading(false); }
  }

  async function handleSeed() {
    try {
      await api.post('/admin/permissions/seed');
      fetchPermissions();
    } catch { setError('Erro ao criar permissões padrão'); }
  }

  function getPerm(role: string, module: string): Permission | undefined {
    return permissions.find(p => p.role === role && p.module === module);
  }

  function togglePerm(role: string, module: string, field: 'canRead' | 'canWrite' | 'canDelete') {
    setPermissions(prev => {
      const existing = prev.find(p => p.role === role && p.module === module);
      if (existing) {
        return prev.map(p => p.id === existing.id ? { ...p, [field]: !p[field] } : p);
      }
      return [...prev, { id: '', tenantId: '', role, module, canRead: field === 'canRead', canWrite: false, canDelete: false }];
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      for (const perm of permissions) {
        await api.post('/admin/permissions', {
          role: perm.role, module: perm.module,
          canRead: perm.canRead, canWrite: perm.canWrite, canDelete: perm.canDelete,
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError('Erro ao salvar permissões'); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={32} className="animate-spin text-purple-600" /></div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Permissões</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Configure permissões granulares por cargo e módulo</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSeed} className="px-4 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface-secondary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">
            Restaurar Padrão
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition">
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}

      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--surface-tertiary)] border-b border-[var(--border-color)]">
              <th className="text-left px-4 py-3 font-medium text-[var(--text-tertiary)] sticky left-0 bg-[var(--surface-tertiary)]">Módulo</th>
              {ROLES.map(role => (
                <th key={role} className="text-center px-3 py-3 font-medium text-[var(--text-tertiary)] min-w-[120px]">{role}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {MODULES.map(module => (
              <tr key={module} className="hover:bg-[var(--surface-tertiary)]">
                <td className="px-4 py-3 font-medium text-[var(--text-primary)] sticky left-0 bg-[var(--surface-primary)]">
                  {moduleLabels[module] || module}
                </td>
                {ROLES.map(role => {
                  const perm = getPerm(role, module);
                  return (
                    <td key={`${role}-${module}`} className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => togglePerm(role, module, 'canRead')}
                          className={`w-7 h-7 rounded text-xs font-medium transition ${
                            perm?.canRead ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                          }`}
                          title="Ler"
                        >R</button>
                        <button
                          onClick={() => togglePerm(role, module, 'canWrite')}
                          className={`w-7 h-7 rounded text-xs font-medium transition ${
                            perm?.canWrite ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                          }`}
                          title="Escrever"
                        >W</button>
                        <button
                          onClick={() => togglePerm(role, module, 'canDelete')}
                          className={`w-7 h-7 rounded text-xs font-medium transition ${
                            perm?.canDelete ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'
                          }`}
                          title="Deletar"
                        >D</button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
