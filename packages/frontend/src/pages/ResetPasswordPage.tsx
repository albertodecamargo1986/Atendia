import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { MessageSquare, Lock, Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setTokenValid(false);
      return;
    }
    api.post('/auth/validate-reset-token', { token })
      .then(({ data }) => {
        setTokenValid(data.valid);
      })
      .catch(() => {
        setTokenValid(false);
      })
      .finally(() => setValidating(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('As senhas nao conferem');
      return;
    }
    if (password.length < 6) {
      setError('Senha deve ter no minimo 6 caracteres');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao redefinir senha');
    } finally {
      setLoading(false);
    }
  }

  if (validating) {
    return (
      <div className="min-h-screen bg-[var(--surface-secondary)] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--color-primary-500)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-secondary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[var(--color-primary-500)] flex items-center justify-center mb-4 shadow-lg">
            <MessageSquare size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Redefinir <span className="text-[var(--color-primary-500)]">Senha</span>
          </h1>
        </div>

        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] shadow-card p-8">
          {success ? (
            <div className="text-center">
              <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Senha redefinida!</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-4">Redirecionando para o login...</p>
            </div>
          ) : !tokenValid ? (
            <div className="text-center">
              <XCircle size={48} className="mx-auto text-red-500 mb-4" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Token invalido</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Este link de recuperacao e invalido ou expirou. Solicite um novo.
              </p>
              <Link to="/forgot-password" className="text-sm text-[var(--color-primary-500)] hover:underline font-medium">
                Solicitar nova recuperacao
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Nova senha</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required minLength={6} value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                    placeholder="Minimo 6 caracteres"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Confirmar senha</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required minLength={6} value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                    placeholder="Repita a senha"
                  />
                </div>
              </div>

              <button type="submit" disabled={loading || !password || !confirmPassword}
                className="w-full px-4 py-2.5 bg-[var(--color-primary-500)] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2">
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                Redefinir senha
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
