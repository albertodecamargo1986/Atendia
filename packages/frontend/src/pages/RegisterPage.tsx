import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, MessageSquare } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { PasswordStrength } from '../components/ui/PasswordStrength';
import { passwordProblems, slugFromName } from '../lib/password';

export default function RegisterPage() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const isLoading = useAuthStore((s) => s.isLoading);
  const { theme } = useThemeStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const problems = passwordProblems(password);
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (problems.length > 0) {
      setError(`A senha precisa ${problems.join(', ')}.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não são iguais. Digite a mesma senha nos dois campos.');
      return;
    }
    if (!acceptTerms) {
      setError('Para criar a conta, marque que você aceita os Termos de Uso.');
      return;
    }

    try {
      // O identificador interno da empresa (slug) é gerado automaticamente
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        tenantName: tenantName.trim(),
        tenantSlug: slugFromName(tenantName),
      });
      navigate('/onboarding');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível criar a conta.');
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface-secondary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fadeIn">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[var(--color-primary-500)] flex items-center justify-center mb-4 shadow-lg">
            <MessageSquare size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Atend<span className="text-[var(--color-primary-500)]">IA</span>
          </h1>
          <p className="text-[var(--text-secondary)] mt-2 text-sm">Crie sua conta grátis em 1 minuto</p>
        </div>

        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] shadow-card p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <Alert variant="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            <Input
              label="Seu nome"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              autoComplete="name"
              placeholder="João Silva"
            />

            <Input
              label="Nome da empresa"
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              required
              minLength={2}
              autoComplete="organization"
              placeholder="Minha Loja"
            />

            <Input
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="seu@email.com"
            />

            <div className="space-y-1.5">
              <label htmlFor="reg-password" className="block text-sm font-medium text-[var(--text-primary)]">Senha</label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-3 py-2 pr-11 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-transparent outline-none transition text-sm"
                  placeholder="Mínimo 8 caracteres, com letras e números"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <Input
              label="Confirmar senha"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Digite a senha de novo"
              error={mismatch ? 'As senhas não são iguais' : undefined}
            />

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-[var(--border-color)] accent-[var(--color-primary-500)]"
              />
              <span className="text-sm text-[var(--text-secondary)]">
                Li e aceito os <strong>Termos de Uso</strong> e a <strong>Política de Privacidade</strong> do AtendIA.
              </span>
            </label>

            <Button
              type="submit"
              loading={isLoading}
              disabled={!name || !tenantName || !email || !password || !confirmPassword || !acceptTerms}
              className="w-full"
            >
              {isLoading ? 'Criando conta...' : 'Criar conta grátis'}
            </Button>
          </form>

          <p className="text-center text-sm text-[var(--text-secondary)] mt-6">
            Já tem conta?{' '}
            <Link to="/login" className="text-[var(--color-primary-500)] hover:underline font-medium">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
