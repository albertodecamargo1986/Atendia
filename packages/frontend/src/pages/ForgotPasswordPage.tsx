import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Mail, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao solicitar recuperacao');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface-secondary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[var(--color-primary-500)] flex items-center justify-center mb-4 shadow-lg">
            <MessageSquare size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Recuperar <span className="text-[var(--color-primary-500)]">Senha</span>
          </h1>
        </div>

        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] shadow-card p-8">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Email enviado!</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Se o email {email} estiver cadastrado, voce recebera um link para redefinir sua senha.
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mb-6">
                Em desenvolvimento, o token aparece no console do servidor.
              </p>
              <Link to="/login" className="text-sm text-[var(--color-primary-500)] hover:underline font-medium">
                Voltar para o login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Digite seu email e enviaremos um link para redefinir sua senha.
              </p>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    type="email" required value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                    placeholder="seu@email.com"
                  />
                </div>
              </div>

              <button type="submit" disabled={loading || !email}
                className="w-full px-4 py-2.5 bg-[var(--color-primary-500)] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2">
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                Enviar link de recuperacao
              </button>

              <div className="text-center">
                <Link to="/login" className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">
                  <ArrowLeft size={14} /> Voltar ao login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
