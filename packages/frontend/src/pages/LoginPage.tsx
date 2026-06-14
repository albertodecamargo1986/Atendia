import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import { Eye, EyeOff, Shield, MessageSquare } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const { theme } = useThemeStore();

  const [email, setEmail] = useState(() => localStorage.getItem('atendia_saved_email') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(() => !!localStorage.getItem('atendia_saved_email'));
  const [error, setError] = useState('');

  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (rememberEmail) {
      localStorage.setItem('atendia_saved_email', email);
    } else {
      localStorage.removeItem('atendia_saved_email');
    }
  }, [email, rememberEmail]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (requires2FA) {
      try {
        await login(email, password, twoFactorToken);
        navigate('/');
      } catch (err: any) {
        setError(err.message);
      }
      return;
    }

    try {
      if (rememberEmail) {
        localStorage.setItem('atendia_saved_email', email);
      }
      await login(email, password, undefined);
      navigate('/');
    } catch (err: any) {
      if (err.message === '2FA_REQUIRED' || err.requiresTwoFactor) {
        setRequires2FA(true);
      } else {
        setError(err.message);
      }
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface-secondary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo + Title */}
        <div className="text-center mb-8 animate-fadeIn">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[var(--color-primary-500)] flex items-center justify-center mb-4 shadow-lg">
            <MessageSquare size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Atend<span className="text-[var(--color-primary-500)]">IA</span>
          </h1>
          <p className="text-[var(--text-secondary)] mt-2 text-sm">
            {requires2FA ? 'Verificação de dois fatores' : 'Multi-atendimento inteligente'}
          </p>
        </div>

        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] shadow-card p-8 animate-slideInUp">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {requires2FA ? (
              <>
                <Alert variant="info">
                  <div className="flex items-center gap-3">
                    <Shield size={20} className="text-[var(--color-info)] shrink-0" />
                    <span>Sua conta tem autenticação de dois fatores ativada. Digite o código do seu aplicativo autenticador.</span>
                  </div>
                </Alert>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                    Código de verificação
                  </label>
                  <input
                    type="text"
                    value={twoFactorToken}
                    onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    maxLength={6}
                    className="w-full px-4 py-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-transparent outline-none transition text-center font-mono text-2xl tracking-[0.5em]"
                    placeholder="000000"
                    autoFocus
                  />
                </div>

                <Button
                  type="submit"
                  loading={isLoading}
                  disabled={twoFactorToken.length !== 6}
                  className="w-full"
                >
                  Verificar e Entrar
                </Button>

                <button
                  type="button"
                  onClick={() => { setRequires2FA(false); setTwoFactorToken(''); }}
                  className="w-full py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                >
                  Voltar ao login
                </button>
              </>
            ) : (
              <>
                <Input
                  label="E-mail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                />
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(e) => setRememberEmail(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border-color)] text-[var(--color-primary-500)] focus:ring-[var(--color-primary-500)]"
                  />
                  <span className="text-sm text-[var(--text-secondary)]">Lembrar e-mail</span>
                </label>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Senha</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-2.5 pr-12 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-transparent outline-none transition text-sm"
                      placeholder="Mínimo 6 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <Button type="submit" loading={isLoading} className="w-full">
                  Entrar
                </Button>
              </>
            )}
          </form>

          {!requires2FA && (
            <p className="text-center text-sm text-[var(--text-secondary)] mt-6">
              Não tem conta?{' '}
              <Link to="/register" className="text-[var(--color-primary-500)] hover:underline font-medium">
                Criar conta grátis
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}