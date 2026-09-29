import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { User, Building2, Shield, Save, RefreshCw, Eye, EyeOff, Smartphone, Key, CreditCard, ArrowUpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../stores/auth';
import api from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { PLAN_LABELS } from '../lib/plans';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PasswordStrength } from '../components/ui/PasswordStrength';
import { passwordProblems } from '../lib/password';
import ApiKeyField, { type ApiKeyInfo } from '../components/ApiKeyField';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Administrador da plataforma',
  OWNER: 'Dono(a) da conta',
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  OPERATOR: 'Atendente',
};

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none';
const disabledInputClass =
  'w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-secondary)] text-[var(--text-secondary)] text-sm';

/**
 * Configurações em abas (rotas em App.tsx):
 *   /settings              → Perfil (dados, senha e verificação em duas etapas)
 *   /settings/company      → Empresa
 *   /settings/ai           → Chave da IA
 *   /settings/integrations → Integrações (WebhooksPage)
 */

/** Aba "Perfil": todos os papéis veem. */
export default function ProfileSettings() {
  const { user, checkAuth } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [twoFAStatus, setTwoFAStatus] = useState<'idle' | 'setup' | 'enabling' | 'disabling'>('idle');
  const [twoFAQrImage, setTwoFAQrImage] = useState('');
  const [twoFASecret, setTwoFASecret] = useState('');
  const [twoFAToken, setTwoFAToken] = useState('');
  const [twoFAEnabled, setTwoFAEnabled] = useState<boolean | null>(user?.twoFactorEnabled ?? null);

  useEffect(() => { if (user?.name) setName(user.name); }, [user?.name]);

  // Estado do 2FA: vem do /auth/me; se o backend não enviar, tenta /2fa/status
  useEffect(() => {
    if (typeof user?.twoFactorEnabled === 'boolean') {
      setTwoFAEnabled(user.twoFactorEnabled);
      return;
    }
    api.get('/2fa/status')
      .then(({ data }) => setTwoFAEnabled(!!(data?.enabled ?? data?.twoFactorEnabled)))
      .catch(() => setTwoFAEnabled(null));
  }, [user?.twoFactorEnabled]);

  async function saveProfile() {
    if (!name.trim() || name === user?.name) return;
    setSaving(true);
    try {
      await api.patch('/users/profile/me', { name: name.trim() });
      await checkAuth();
      toast.success('Nome atualizado!');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível atualizar o nome.'));
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    if (!currentPassword || !newPassword) return;
    const problems = passwordProblems(newPassword);
    if (problems.length) {
      toast.error(`A nova senha precisa ${problems.join(', ')}.`);
      return;
    }
    setSavingPassword(true);
    try {
      await api.patch('/users/profile/me', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setShowPasswordSection(false);
      toast.success('Senha alterada com sucesso!');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível alterar a senha.'));
    } finally {
      setSavingPassword(false);
    }
  }

  async function handle2FASetup() {
    setTwoFAStatus('setup');
    try {
      const { data } = await api.post('/2fa/setup');
      setTwoFASecret(data.secret);
      // QR gerado aqui mesmo (a chave secreta não sai do navegador)
      const img = await QRCode.toDataURL(data.qrUrl || data.otpauthUrl || '', { width: 200, margin: 1 });
      setTwoFAQrImage(img);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível iniciar a verificação em duas etapas.'));
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
      setTwoFAQrImage('');
      setTwoFASecret('');
      toast.success('Verificação em duas etapas ativada!');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Código inválido.'));
      setTwoFAStatus('setup');
    }
  }

  async function handle2FADisable() {
    if (!twoFAToken) return;
    try {
      await api.post('/2fa/disable', { token: twoFAToken });
      setTwoFAEnabled(false);
      setTwoFAStatus('idle');
      setTwoFAToken('');
      toast.success('Verificação em duas etapas desativada.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Código inválido.'));
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="space-y-6">
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <User size={20} className="text-[var(--color-primary-500)]" /> Meu perfil
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="settings-name" className="block text-sm font-medium text-[var(--text-primary)] mb-1">Nome</label>
              <div className="flex gap-2">
                <input id="settings-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                <Button onClick={saveProfile} loading={saving} disabled={name === user?.name || !name.trim()}>
                  {!saving && <Save size={14} />} Salvar
                </Button>
              </div>
            </div>
            <div>
              <label htmlFor="settings-email" className="block text-sm font-medium text-[var(--text-primary)] mb-1">E-mail</label>
              <input id="settings-email" type="email" value={user?.email || ''} disabled className={disabledInputClass} />
            </div>
            <div>
              <label htmlFor="settings-role" className="block text-sm font-medium text-[var(--text-primary)] mb-1">Função</label>
              <input id="settings-role" type="text" value={ROLE_LABELS[user?.role || ''] || user?.role || ''} disabled className={disabledInputClass} />
            </div>
          </div>

          <div className="mt-4 border-t border-[var(--border-color)] pt-4">
            <button
              onClick={() => setShowPasswordSection(!showPasswordSection)}
              className="text-sm text-[var(--color-primary-500)] hover:underline font-medium"
            >
              {showPasswordSection ? 'Cancelar troca de senha' : 'Alterar senha'}
            </button>
            {showPasswordSection && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="settings-current" className="block text-sm font-medium text-[var(--text-primary)] mb-1">Senha atual</label>
                  <div className="relative">
                    <input id="settings-current" type={showCurrent ? 'text' : 'password'} value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" className={`${inputClass} pr-10`} />
                    <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                      aria-label={showCurrent ? 'Esconder senha' : 'Mostrar senha'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                      {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="settings-new" className="block text-sm font-medium text-[var(--text-primary)] mb-1">Nova senha</label>
                  <div className="relative">
                    <input id="settings-new" type={showNew ? 'text' : 'password'} value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className={`${inputClass} pr-10`} />
                    <button type="button" onClick={() => setShowNew(!showNew)}
                      aria-label={showNew ? 'Esconder senha' : 'Mostrar senha'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                      {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <PasswordStrength password={newPassword} />
                </div>
                <div className="md:col-span-2">
                  <Button onClick={savePassword} loading={savingPassword} disabled={!currentPassword || !newPassword}>
                    {!savingPassword && <Save size={14} />} Alterar senha
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card padding="lg">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Shield size={20} className="text-[var(--color-primary-500)]" /> Segurança
          </h2>

          {twoFAEnabled === true ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[var(--color-success-bg)] border border-[var(--color-success-border)] rounded-lg">
              <div className="flex items-center gap-3">
                <Shield size={22} className="text-[var(--color-success)]" />
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Verificação em duas etapas ativada</p>
                  <p className="text-xs text-[var(--text-secondary)]">Sua conta está mais segura</p>
                </div>
              </div>
              {twoFAStatus === 'idle' && (
                <Button variant="danger" size="sm" onClick={() => { setTwoFAStatus('disabling'); setTwoFAToken(''); }}>
                  Desativar
                </Button>
              )}
            </div>
          ) : twoFAStatus === 'idle' ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[var(--surface-secondary)] border border-[var(--border-color)] rounded-lg">
              <div className="flex items-center gap-3">
                <Smartphone size={22} className="text-[var(--text-tertiary)]" />
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Verificação em duas etapas</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {twoFAEnabled === null
                      ? 'Além da senha, pede um código do celular ao entrar.'
                      : 'Desativada. Além da senha, pede um código do celular ao entrar.'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handle2FASetup}>Ativar</Button>
                {twoFAEnabled === null && (
                  <Button variant="secondary" onClick={() => { setTwoFAStatus('disabling'); setTwoFAToken(''); }}>
                    Desativar
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {(twoFAStatus === 'setup' || twoFAStatus === 'enabling') && (
            <div className="mt-4 p-6 border border-[var(--border-color)] rounded-lg bg-[var(--surface-secondary)]">
              <p className="text-sm text-[var(--text-primary)] mb-4">
                Abra um aplicativo autenticador (Google Authenticator, Microsoft Authenticator...) e escaneie o código:
              </p>
              <div className="flex flex-col items-center gap-4">
                {twoFAQrImage ? (
                  <img src={twoFAQrImage} alt="QR Code da verificação em duas etapas" className="w-48 h-48 bg-white p-2 rounded-lg border" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center"><RefreshCw className="animate-spin text-[var(--text-tertiary)]" /></div>
                )}
                {twoFASecret && (
                  <details className="w-full">
                    <summary className="text-xs text-[var(--text-tertiary)] cursor-pointer">Não consegue escanear? Digite esta chave no aplicativo</summary>
                    <div className="mt-2 px-3 py-2 bg-[var(--surface-tertiary)] rounded text-sm font-mono text-[var(--text-primary)] select-all break-all">
                      {twoFASecret}
                    </div>
                  </details>
                )}
              </div>
              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <input type="text" inputMode="numeric" value={twoFAToken}
                  onChange={(e) => setTwoFAToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6} placeholder="000000" aria-label="Código de 6 dígitos"
                  className={`${inputClass} text-center font-mono tracking-widest`} />
                <Button onClick={handle2FAEnable} loading={twoFAStatus === 'enabling'} disabled={twoFAToken.length !== 6}>
                  Verificar e ativar
                </Button>
                <Button variant="secondary" onClick={() => { setTwoFAStatus('idle'); setTwoFAToken(''); }}>Cancelar</Button>
              </div>
            </div>
          )}

          {twoFAStatus === 'disabling' && (
            <div className="mt-4 p-4 border border-[var(--border-color)] rounded-lg bg-[var(--surface-secondary)]">
              <p className="text-sm text-[var(--text-primary)] mb-3">Digite o código do aplicativo autenticador para desativar:</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="text" inputMode="numeric" value={twoFAToken}
                  onChange={(e) => setTwoFAToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6} placeholder="000000" aria-label="Código de 6 dígitos"
                  className={`${inputClass} text-center font-mono tracking-widest`} />
                <Button variant="danger" onClick={handle2FADisable} disabled={twoFAToken.length !== 6}>Desativar</Button>
                <Button variant="secondary" onClick={() => { setTwoFAStatus('idle'); setTwoFAToken(''); }}>Cancelar</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Aba "Empresa": dono/administrador. */
export function CompanySettings() {
  const { tenant } = useAuthStore();
  const navigate = useNavigate();
  const planLabel = PLAN_LABELS[tenant?.plan || 'FREE'] || tenant?.plan || '';

  return (
    <div className="max-w-3xl space-y-6">
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <Building2 size={20} className="text-[var(--color-primary-500)]" /> Empresa
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="settings-company" className="block text-sm font-medium text-[var(--text-primary)] mb-1">Nome</label>
            <input id="settings-company" type="text" value={tenant?.name || ''} disabled className={disabledInputClass} />
          </div>
          <div>
            <label htmlFor="settings-plan" className="block text-sm font-medium text-[var(--text-primary)] mb-1">Plano</label>
            <input id="settings-plan" type="text" value={planLabel} disabled className={disabledInputClass} />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate('/billing')}>
            <CreditCard size={14} /> Ver plano e pagamentos
          </Button>
          <Button variant="outline" onClick={() => navigate('/billing/upgrade')}>
            <ArrowUpCircle size={14} /> Mudar plano
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Aba "Chave da IA": dono/administrador. */
export function AiKeySettings() {
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);

  useEffect(() => { fetchApiKeys(); }, []);

  async function fetchApiKeys() {
    try {
      const { data } = await api.get('/settings/api-keys');
      setApiKeys(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível carregar as chaves da IA.'));
    }
  }

  return (
    <div className="max-w-3xl">
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
          <Key size={20} className="text-[var(--color-primary-500)]" /> Chave da IA
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          A chave da IA é como uma "senha" que permite ao AtendIA usar a inteligência artificial para responder
          seus clientes. Você cria a chave no site do provedor (ex.: OpenAI) e cola aqui. Se o servidor já tiver uma
          chave própria, este passo é opcional.
        </p>
        <div className="space-y-4">
          <ApiKeyField provider="OPENAI" info={apiKeys.find((k) => k.provider === 'OPENAI')} onChanged={fetchApiKeys} />
          <ApiKeyField provider="ANTHROPIC" info={apiKeys.find((k) => k.provider === 'ANTHROPIC')} onChanged={fetchApiKeys} />
          <ApiKeyField provider="ELEVENLABS" info={apiKeys.find((k) => k.provider === 'ELEVENLABS')} onChanged={fetchApiKeys} />
        </div>
      </Card>
    </div>
  );
}
