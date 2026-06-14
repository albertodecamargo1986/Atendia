import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import api from '../services/api';
import {
  Bot, Smartphone, Clock, Mic, MessageSquare, BookOpen, Settings,
  Check, ChevronRight, ChevronLeft, Sparkles, Zap, Play
} from 'lucide-react';

interface WizardStep {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

export default function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(false);
  const { user, tenant } = useAuthStore();
  const navigate = useNavigate();

  // Dismiss wizard — store in localStorage
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (localStorage.getItem('atendia_onboarding_done') === 'true') {
      setDismissed(true);
    }
  }, []);

  function handleFinish() {
    localStorage.setItem('atendia_onboarding_done', 'true');
    setCompleted(true);
    setDismissed(true);
  }

  function handleSkip() {
    localStorage.setItem('atendia_onboarding_done', 'true');
    setDismissed(true);
  }

  function handleReset() {
    localStorage.removeItem('atendia_onboarding_done');
    setDismissed(false);
    setCompleted(false);
    setCurrentStep(0);
  }

  if (dismissed && !completed) return null;

  if (completed) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Tudo pronto!</h2>
          <p className="text-gray-500 mb-6">Você já sabe como usar o AtendIA. Se precisar de ajuda, consulte esta página a qualquer momento.</p>
          <button onClick={() => navigate('/')} className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition">
            Ir para o Dashboard
          </button>
        </div>
      </div>
    );
  }

  const steps: WizardStep[] = [
    {
      id: 'welcome',
      title: 'Bem-vindo ao AtendIA',
      icon: <Sparkles size={24} className="text-indigo-600" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600">O AtendIA é seu assistente de atendimento inteligente. Ele automatiza conversas via WhatsApp com IA e permite que humanos assumam quando necessário.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-indigo-50 rounded-lg text-center">
              <Bot size={24} className="mx-auto text-indigo-600 mb-2" />
              <p className="text-sm font-medium text-gray-900">Agente IA</p>
              <p className="text-xs text-gray-500">Atende 24h automaticamente</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg text-center">
              <MessageSquare size={24} className="mx-auto text-green-600 mb-2" />
              <p className="text-sm font-medium text-gray-900">Takeover Humano</p>
              <p className="text-xs text-gray-500">Assuma conversas a qualquer momento</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg text-center">
              <Mic size={24} className="mx-auto text-amber-600 mb-2" />
              <p className="text-sm font-medium text-gray-900">Voz Humanizada</p>
              <p className="text-xs text-gray-500">Áudios com voz clonada</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg text-center">
              <BookOpen size={24} className="mx-auto text-purple-600 mb-2" />
              <p className="text-sm font-medium text-gray-900">Base de Conhecimento</p>
              <p className="text-xs text-gray-500">Respostas precisas da sua empresa</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'api-keys',
      title: 'Configure as API Keys',
      icon: <Settings size={24} className="text-indigo-600" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600">Para o agente IA funcionar, você precisa configurar ao menos uma chave de API de inteligência artificial.</p>
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900 mb-1">OpenAI (obrigatório para GPT)</p>
              <p className="text-xs text-gray-500">1. Vá em <strong>api.openai.com</strong> &rarr; API Keys &rarr; Create new key</p>
              <p className="text-xs text-gray-500">2. Copie a chave e cole em <strong>Configurações &gt; API Keys</strong></p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900 mb-1">Anthropic (para Claude)</p>
              <p className="text-xs text-gray-500">1. Vá em <strong>console.anthropic.com</strong> &rarr; API Keys</p>
              <p className="text-xs text-gray-500">2. Copie a chave e cole em <strong>Configurações &gt; API Keys</strong></p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900 mb-1">ElevenLabs (para voz)</p>
              <p className="text-xs text-gray-500">1. Vá em <strong>elevenlabs.io</strong> &rarr; Profile &rarr; API Key</p>
              <p className="text-xs text-gray-500">2. Opcional — só se quiser áudios com voz clonada</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'agent',
      title: 'Crie seu Agente IA',
      icon: <Bot size={24} className="text-indigo-600" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600">O agente é o "cérebro" do atendimento. Ele responde mensagens automaticamente usando IA.</p>
          <div className="space-y-3">
            <div className="p-4 border border-indigo-200 bg-indigo-50 rounded-lg">
              <p className="text-sm font-semibold text-indigo-800 mb-2">Passo a passo:</p>
              <ol className="text-sm text-indigo-700 space-y-2 list-decimal list-inside">
                <li>Vá em <strong>Agentes</strong> no menu lateral</li>
                <li>Clique em <strong>Novo Agente</strong></li>
                <li>Dê um nome (ex: "Atendente Suporte")</li>
                <li>Escolha o modelo de IA (GPT-4o Mini é o mais econômico)</li>
                <li>Escreva o <strong>Prompt do Sistema</strong> — explique como o agente deve se comportar</li>
                <li>Ajuste o tom de voz, delay de resposta e frequência de áudio</li>
                <li>Clique em <strong>Salvar</strong> e depois <strong>Testar</strong></li>
              </ol>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700"><strong>Dica:</strong> O prompt é a parte mais importante. Ex: "Você é o atendente da empresa X. Sempre seja educado, objetivo e pergunte se o cliente precisa de mais ajuda."</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'whatsapp',
      title: 'Conecte o WhatsApp',
      icon: <Smartphone size={24} className="text-indigo-600" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600">Conecte seu número de WhatsApp para receber e enviar mensagens automaticamente.</p>
          <div className="space-y-3">
            <div className="p-4 border border-green-200 bg-green-50 rounded-lg">
              <p className="text-sm font-semibold text-green-800 mb-2">Como conectar:</p>
              <ol className="text-sm text-green-700 space-y-2 list-decimal list-inside">
                <li>Vá em <strong>WhatsApp</strong> no menu lateral</li>
                <li>Clique em <strong>Nova Sessão</strong></li>
                <li>Escaneie o <strong>QR Code</strong> com o celular (WhatsApp &gt; Aparelhos conectados)</li>
                <li>Aguarde o status mudar para <strong>Conectado</strong></li>
              </ol>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">Após a conexão, todas as mensagens recebidas neste número serão respondidas automaticamente pelo agente IA.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'hours',
      title: 'Configure os Horários',
      icon: <Clock size={24} className="text-indigo-600" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600">Defina quando o agente atende automaticamente. Fora do horário, o sistema envia mensagem de ausência.</p>
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900 mb-2">Opções rápidas:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li><strong>24h</strong> — Atendimento ininterrupto (00:00 às 23:59)</li>
                <li><strong>Comercial</strong> — Seg a Sex, 9h às 18h</li>
                <li><strong>Personalizado</strong> — Configure cada dia individualmente</li>
              </ul>
            </div>
            <p className="text-xs text-gray-400">Vá em <strong>Horários</strong> no menu lateral para configurar.</p>
          </div>
        </div>
      ),
    },
    {
      id: 'voice',
      title: 'Voz Humanizada (Opcional)',
      icon: <Mic size={24} className="text-indigo-600" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600">O agente pode enviar áudios com voz humana, tornando o atendimento mais natural.</p>
          <div className="space-y-3">
            <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg">
              <p className="text-sm font-semibold text-amber-800 mb-2">Como configurar:</p>
              <ol className="text-sm text-amber-700 space-y-2 list-decimal list-inside">
                <li>Vá em <strong>Vozes</strong> no menu lateral</li>
                <li>Opção A: Clique em <strong>Gravar Voz</strong> e grave amostras (30s+ cada)</li>
                <li>Opção B: Cole um Voice ID do ElevenLabs manualmente</li>
                <li>No agente, selecione a voz e ajuste a frequência de áudio</li>
              </ol>
            </div>
            <p className="text-xs text-gray-400">Requer API Key do ElevenLabs configurada em Configurações.</p>
          </div>
        </div>
      ),
    },
    {
      id: 'conversations',
      title: 'Gerencie Conversas',
      icon: <MessageSquare size={24} className="text-indigo-600" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600">O AtendIA permite que você veja todas as conversas e assuma o atendimento quando quiser.</p>
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900 mb-2">Fluxo de conversa:</p>
              <div className="flex items-center gap-2 text-sm">
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Agente IA</span>
                <ChevronRight size={14} />
                <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">Assumir</span>
                <ChevronRight size={14} />
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Humano</span>
                <ChevronRight size={14} />
                <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">Resolver</span>
              </div>
            </div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li><strong>Escalonar/Assumir:</strong> Você toma a conversa do agente</li>
              <li><strong>Devolver ao Agente:</strong> A IA volta a responder</li>
              <li><strong>Transferir:</strong> Passa para outro operador</li>
              <li><strong>Nota Interna:</strong> Anotação visível só para a equipe</li>
            </ul>
          </div>
        </div>
      ),
    },
  ];

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Progress */}
        <div className="flex bg-gray-100">
          {steps.map((s, i) => (
            <div
              key={s.id}
              className={`flex-1 h-1.5 transition-colors ${i <= currentStep ? 'bg-indigo-600' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        <div className="p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            {step.icon}
            <div>
              <p className="text-xs text-gray-400">Passo {currentStep + 1} de {steps.length}</p>
              <h2 className="text-xl font-bold text-gray-900">{step.title}</h2>
            </div>
          </div>

          {/* Content */}
          <div className="mb-8">{step.content}</div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button onClick={handleSkip} className="text-sm text-gray-400 hover:text-gray-600 transition">
              Pular tutorial
            </button>
            <div className="flex items-center gap-3">
              {currentStep > 0 && (
                <button onClick={() => setCurrentStep((c) => c - 1)}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
                  <ChevronLeft size={16} /> Voltar
                </button>
              )}
              {currentStep < steps.length - 1 ? (
                <button onClick={() => setCurrentStep((c) => c + 1)}
                  className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition">
                  Próximo <ChevronRight size={16} />
                </button>
              ) : (
                <button onClick={handleFinish}
                  className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition">
                  <Check size={16} /> Concluir
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
