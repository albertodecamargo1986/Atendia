import { useState, useEffect } from 'react';
import api from '../services/api';
import { CreditCard, Check, X, Loader2, ArrowRight, Zap, Shield, Globe, Server, DollarSign } from 'lucide-react';

type WizardStep = 'token' | 'plans' | 'activate' | 'done';

export default function AdminMercadoPagoPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<WizardStep>('token');
  const [token, setToken] = useState('');
  const [isSandbox, setIsSandbox] = useState(true);
  const [tokenTestResult, setTokenTestResult] = useState<any>(null);
  const [tokenTestLoading, setTokenTestLoading] = useState(false);
  const [plansCreated, setPlansCreated] = useState<any[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadStatus(); }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/mercadopago/status');
      setConfig(data);
      if (data.configured) setStep('done');
    } catch {}
    finally { setLoading(false); }
  }

  async function testToken() {
    if (!token.trim()) { setError('Digite o token de acesso'); return; }
    setTokenTestLoading(true);
    setError('');
    setTokenTestResult(null);
    try {
      const { data } = await api.post('/admin/mercadopago/test-token', { token });
      if (data.valid) {
        setTokenTestResult(data);
      } else {
        setError('Token inválido');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao testar token');
    } finally {
      setTokenTestLoading(false);
    }
  }

  async function createPlans() {
    setPlansLoading(true);
    setError('');
    try {
      const { data } = await api.post('/admin/mercadopago/setup-plans', { token });
      setPlansCreated(data.plans);
      setStep('activate');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar planos');
    } finally {
      setPlansLoading(false);
    }
  }

  async function activate() {
    setSaving(true);
    setError('');
    try {
      const starterPlan = plansCreated.find((p: any) => p.plan === 'STARTER');
      const proPlan = plansCreated.find((p: any) => p.plan === 'PRO');
      const enterprisePlan = plansCreated.find((p: any) => p.plan === 'ENTERPRISE');
      await api.post('/admin/mercadopago/save-config', {
        accessToken: token,
        isSandbox,
        preapprovalPlanStarterId: starterPlan?.mpPlanId || '',
        preapprovalPlanProId: proPlan?.mpPlanId || '',
        preapprovalPlanEnterpriseId: enterprisePlan?.mpPlanId || '',
        isActive: true,
      });
      setStep('done');
      loadStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
          <CreditCard size={20} className="text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Mercado Pago</h1>
          <p className="text-sm text-[var(--text-secondary)]">Configure assinaturas recorrentes</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-8 text-sm">
        {[
          { key: 'token', label: 'Token' },
          { key: 'plans', label: 'Planos' },
          { key: 'activate', label: 'Ativar' },
          { key: 'done', label: 'Concluído' },
        ].map((s, i) => {
          const stepIdx = ['token', 'plans', 'activate', 'done'].indexOf(step);
          const sIdx = ['token', 'plans', 'activate', 'done'].indexOf(s.key);
          const isActive = stepIdx >= sIdx;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-6 ${isActive ? 'bg-purple-500' : 'bg-[var(--border-color)]'}`} />}
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                isActive ? 'bg-purple-100 text-purple-700' : 'text-[var(--text-tertiary)]'
              }`}>{s.label}</span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      {/* Step 1: Token */}
      {step === 'token' && (
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <div className="flex items-center gap-2 mb-1">
            <Shield size={16} className="text-purple-600" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">1. Token de Acesso</h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Cole seu token de acesso do Mercado Pago.
            Use o <strong>Access Token de produção</strong> (começa com <code>APP_USR-</code>)
            ou o <strong>de sandbox</strong> (começa com <code>TEST-</code>).
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Access Token</label>
              <input type="password" value={token} onChange={e => setToken(e.target.value)}
                placeholder="APP_USR-... ou TEST-..."
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isSandbox} onChange={e => setIsSandbox(e.target.checked)}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <span className="flex items-center gap-1">
                  <Server size={14} /> Ambiente de testes (Sandbox)
                </span>
              </label>
            </div>

            <div className="flex gap-3">
              <button onClick={testToken} disabled={tokenTestLoading || !token.trim()}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition flex items-center gap-1">
                {tokenTestLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Testar Token
              </button>
              {tokenTestResult && (
                <button onClick={createPlans} disabled={plansLoading}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition flex items-center gap-1">
                  Avançar <ArrowRight size={14} />
                </button>
              )}
            </div>

            {tokenTestResult && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                <div className="flex items-center gap-1 font-medium mb-1"><Check size={14} /> Token válido!</div>
                <p>Conta: {tokenTestResult.name} ({tokenTestResult.email})</p>
                <p>ID: {tokenTestResult.id}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Plans */}
      {step === 'plans' && (
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <div className="flex items-center gap-2 mb-1">
            <Globe size={16} className="text-purple-600" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">2. Criar Planos Recorrentes</h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Vamos criar 3 planos de assinatura mensal no Mercado Pago:
          </p>

          <div className="space-y-3 mb-4">
            {[
              { name: 'Starter', price: 'R$ 147/mês', desc: 'Para pequenos negócios' },
              { name: 'Pro', price: 'R$ 381/mês', desc: 'Para equipes em crescimento' },
              { name: 'Enterprise', price: 'R$ 1.044/mês', desc: 'Solução completa' },
            ].map(p => (
              <div key={p.name} className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-secondary)]">
                <div>
                  <span className="font-medium text-[var(--text-primary)]">{p.name}</span>
                  <span className="text-xs text-[var(--text-tertiary)] ml-2">{p.desc}</span>
                </div>
                <span className="text-sm font-bold text-purple-600">{p.price}</span>
              </div>
            ))}
          </div>

          <button onClick={createPlans} disabled={plansLoading}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition flex items-center gap-1">
            {plansLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {plansLoading ? 'Criando planos...' : 'Criar Planos no Mercado Pago'}
          </button>
        </div>
      )}

      {/* Step 3: Activate */}
      {step === 'activate' && (
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <div className="flex items-center gap-2 mb-1">
            <Check size={16} className="text-green-600" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">3. Revisar e Ativar</h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Planos criados com sucesso! Revise os IDs e ative a integração.
          </p>

          <div className="space-y-2 mb-4">
            {plansCreated.map((p: any) => (
              <div key={p.plan} className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200 text-sm">
                <span className="font-medium text-green-700">{p.plan}</span>
                <code className="text-xs text-green-600">{p.mpPlanId}</code>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={activate} disabled={saving}
              className="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition flex items-center gap-1">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Ativando...' : 'Ativar Assinaturas'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && config?.configured && (
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Integração Ativa!</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Mercado Pago configurado e pronto para receber assinaturas.
          </p>

          <div className="max-w-sm mx-auto space-y-2 text-left">
            <div className="flex justify-between p-2 rounded bg-[var(--surface-secondary)] text-sm">
              <span className="text-[var(--text-secondary)]">Ambiente</span>
              <span className="font-medium">{config.isSandbox ? 'Sandbox' : 'Produção'}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-[var(--surface-secondary)] text-sm">
              <span className="text-[var(--text-secondary)]">Criado em</span>
              <span className="font-medium">{new Date(config.createdAt).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
        <strong>Importante:</strong> Depois de configurar, os clientes poderão assinar planos na página
        <strong> /upgrade</strong>. As cobranças são automáticas (todo mês).
        Se quiser usar outro token, configure novamente aqui.
      </div>
    </div>
  );
}
