import { useState } from 'react';
import api from '../services/api';
import { Check, CreditCard, Loader2, ArrowLeft, Copy, Download } from 'lucide-react';
import { Link } from 'react-router-dom';

const PLANS = [
  {
    id: 'mensal',
    name: 'Mensal',
    price: 147,
    period: '/mês',
    months: 1,
    desc: 'Ideal para começar',
    highlight: false,
  },
  {
    id: 'trimestral',
    name: 'Trimestral',
    price: 381,
    period: '/3 meses',
    months: 3,
    desc: 'Economize 13%',
    highlight: false,
    equivalent: 'R$127/mês',
  },
  {
    id: 'semestral',
    name: 'Semestral',
    price: 642,
    period: '/6 meses',
    months: 6,
    desc: 'Economize 27%',
    highlight: true,
    equivalent: 'R$107/mês',
  },
  {
    id: 'anual',
    name: 'Anual',
    price: 1044,
    period: '/ano',
    months: 12,
    desc: 'Economize 41%',
    highlight: false,
    equivalent: 'R$87/mês',
  },
];

const FEATURES = [
  'Atendimento via WhatsApp com IA',
  'Agente com voz humanizada',
  'Transcrição automática de áudios',
  'Múltiplos agentes por conta',
  'Gestão de filas e tickets',
  'Dashboard com relatórios',
  'Chat interno entre atendentes',
  'Campanhas de mensagem em massa',
  'Webhooks para integração',
  'Suporte técnico via chat',
];

export default function PricingPage() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ serial: string; preferenceId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSelectPlan(planId: string) {
    setSelectedPlan(planId);
    setShowForm(true);
    setError('');
    setResult(null);
  }

  async function handleCheckout() {
    if (!selectedPlan || !name || !email || !cpfCnpj || !phone) {
      setError('Preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/payments/checkout', {
        name,
        email,
        cpfCnpj,
        phone,
        plan: selectedPlan,
      });

      if (data.data?.initPoint) {
        // Redirect to Mercado Pago
        window.location.href = data.data.initPoint;
      } else if (data.data?.sandboxInitPoint) {
        window.location.href = data.data.sandboxInitPoint;
      } else if (data.data?.serial) {
        setResult({ serial: data.data.serial, preferenceId: data.data.preferenceId });
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao processar checkout');
    } finally {
      setLoading(false);
    }
  }

  function handleCopySerial() {
    if (result?.serial) {
      navigator.clipboard.writeText(result.serial);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Pedido realizado!</h1>
          <p className="text-gray-500 mb-6">Após a confirmação do pagamento, sua licença será ativada.</p>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">Seu número de série:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-left bg-white px-3 py-2 rounded-lg border font-mono text-sm text-indigo-700 break-all">
                {result.serial}
              </code>
              <button onClick={handleCopySerial} className="p-2 rounded-lg hover:bg-gray-200 transition" title="Copiar">
                {copied ? <Check size={18} className="text-green-600" /> : <Copy size={18} className="text-gray-500" />}
              </button>
            </div>
          </div>

          <a
            href={`${window.location.origin}/download/latest?serial=${result.serial}`}
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium mb-3"
          >
            <Download size={18} /> Baixar AtendIA Desktop
          </a>

          <Link to="/activate" className="block text-sm text-indigo-600 hover:text-indigo-800 mt-4">
            Já tem o app? Ative sua licença aqui
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft size={16} /> Voltar ao login
          </Link>
          <span className="text-lg font-bold text-indigo-600">AtendIA</span>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-4 pt-12 pb-8 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Escolha seu plano</h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto">
          Automatize seu atendimento no WhatsApp com IA humanizada. Quanto mais tempo o plano, maior a economia.
        </p>
      </div>

      {/* Plans Grid */}
      <div className="max-w-6xl mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              onClick={() => handleSelectPlan(plan.id)}
              className={`relative bg-white rounded-xl border-2 p-6 cursor-pointer transition hover:shadow-lg ${
                selectedPlan === plan.id
                  ? 'border-indigo-600 shadow-lg ring-2 ring-indigo-600/20'
                  : plan.highlight
                  ? 'border-indigo-300 shadow-md'
                  : 'border-gray-200'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full">
                  MAIS POPULAR
                </span>
              )}
              <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{plan.desc}</p>
              <div className="mt-4">
                <span className="text-3xl font-bold text-gray-900">R${plan.price}</span>
                <span className="text-sm text-gray-500">{plan.period}</span>
              </div>
              {plan.equivalent && (
                <p className="text-xs text-green-600 font-medium mt-1">Equivalente a {plan.equivalent}</p>
              )}
              <button
                className={`mt-4 w-full py-2 rounded-lg text-sm font-medium transition ${
                  selectedPlan === plan.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {selectedPlan === plan.id ? 'Selecionado' : 'Selecionar'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4 text-center">Todos os planos incluem:</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FEATURES.map((feature, i) => (
              <div key={i} className="flex items-center gap-2">
                <Check size={16} className="text-green-500 flex-shrink-0" />
                <span className="text-sm text-gray-700">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Checkout Form */}
      {showForm && (
        <div className="max-w-lg mx-auto px-4 pb-16">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CreditCard size={20} className="text-indigo-600" /> Finalizar assinatura
            </h2>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  placeholder="João da Silva" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  placeholder="joao@empresa.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CPF / CNPJ *</label>
                <input type="text" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone *</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  placeholder="(11) 99999-9999" />
              </div>
            </div>

            <button onClick={handleCheckout} disabled={loading}
              className="mt-6 w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium disabled:opacity-50">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
              {loading ? 'Processando...' : 'Pagar com Mercado Pago'}
            </button>

            <p className="text-xs text-gray-400 text-center mt-3">
              Pagamento seguro via Mercado Pago. Você será redirecionado.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
