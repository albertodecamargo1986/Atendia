import {
  BookOpen, BarChart3, Ticket, Bot, MessageSquare, Contact, Layers, Tag, Zap,
  Megaphone, Mic, Webhook, FileBarChart, MessageCircle,
  Smartphone, Clock, Users, Key, Settings, Shield, Building2, CreditCard,
} from 'lucide-react';

const pages = [
  {
    category: 'Atendimento',
    items: [
      { icon: Ticket, label: 'Tickets', desc: 'Gerencie os chamados de atendimento. Visualize tickets pendentes, em atendimento e fechados. Atribua operadores, edite status e acompanhe o historico.' },
      { icon: MessageSquare, label: 'Conversas', desc: 'Acompanhe conversas em tempo real com clientes. Veja mensagens do agente IA, assuma o controle manual quando necessario, e visualize o historico completo.' },
      { icon: Contact, label: 'Contatos', desc: 'Base de contatos dos clientes. Visualize informacoes como nome, telefone, email, empresa. Crie novos contatos manualmente e veja o historico de tickets.' },
    ],
  },
  {
    category: 'Configuracao do Sistema',
    items: [
      { icon: Bot, label: 'Agentes', desc: 'Crie e configure agentes de IA. Defina o prompt do sistema, tom de voz, modelo, temperatura e regras de escalonamento.' },
      { icon: BookOpen, label: 'Conhecimento', desc: 'Gerencie a base de conhecimento dos agentes. Upload de documentos (PDF, TXT) que o agente IA usara para responder.' },
      { icon: Layers, label: 'Filas', desc: 'Configure filas de atendimento para organizar tickets por assunto ou prioridade.' },
      { icon: Tag, label: 'Tags', desc: 'Crie etiquetas para categorizar tickets. Util para filtrar e organizar atendimentos.' },
      { icon: Zap, label: 'Respostas Rapidas', desc: 'Crie atalhos de texto para respostas frequentes. Economiza tempo em mensagens comuns.' },
      { icon: Smartphone, label: 'WhatsApp', desc: 'Gerencie as conexoes WhatsApp. Escaneie o QR code para conectar e acompanhe o status das sessoes.' },
      { icon: Clock, label: 'Horarios', desc: 'Configure horarios de funcionamento. Fora do horario, mensagens automaticas sao enviadas.' },
      { icon: Mic, label: 'Vozes', desc: 'Configure perfis de voz para TTS (Text-to-Speech). Integracao com ElevenLabs para sintese de voz.' },
      { icon: Megaphone, label: 'Campanhas', desc: 'Crie campanhas de disparo em massa de mensagens para contatos.' },
    ],
  },
  {
    category: 'Equipe e Administracao',
    items: [
      { icon: Users, label: 'Equipe', desc: 'Gerencie membros da equipe. Convide, ative/desative, altere cargos (OWNER, ADMIN, SUPERVISOR, OPERATOR).' },
      { icon: MessageCircle, label: 'Chat Interno', desc: 'Comunique-se com outros membros da equipe em tempo real.' },
      { icon: FileBarChart, label: 'Relatorios', desc: 'Visualize metricas e relatorios de atendimento, desempenho dos agentes e volume.' },
      { icon: BarChart3, label: 'Dashboard', desc: 'Visao geral do sistema com metricas principais: tickets, conversas, agentes, uso de IA.' },
      { icon: Key, label: 'Licenca', desc: 'Veja o status da sua licenca, ative o sistema e gerencie a ativacao.' },
    ],
  },
  {
    category: 'Area Administrativa (OWNER/ADMIN)',
    items: [
      { icon: Webhook, label: 'Webhooks', desc: 'Integre com sistemas externos. Envia eventos (ticket.created, message.received, etc.) para URLs configuradas. Restrito a OWNER/ADMIN.' },
      { icon: Settings, label: 'Configuracoes', desc: 'Configure chaves de API (OpenAI, Anthropic, ElevenLabs), altere seu perfil e senha, gerencie 2FA.' },
    ],
  },
  {
    category: 'Painel Admin Global',
    items: [
      { icon: Building2, label: 'Clientes (Admin)', desc: 'Visualize e gerencie todos os tenants do sistema, seus planos, limites e status.' },
      { icon: Key, label: 'Licencas (Admin)', desc: 'Gerencie todas as licencas emitidas, crie novas, revogue ativas.' },
      { icon: CreditCard, label: 'Pagamentos (Admin)', desc: 'Historico de todos os pagamentos recebidos no sistema.' },
      { icon: Shield, label: 'Permissoes (Admin)', desc: 'Configure permissoes granulares por cargo (role) e modulo do sistema.' },
    ],
  },
];

export default function OwnerGuidePage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <BookOpen size={24} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Guia do Owner</h1>
            <p className="text-sm text-[var(--text-secondary)]">Documentacao completa do sistema AtendIA</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 mb-8">
          <p className="font-medium mb-1">Visivel apenas para OWNER</p>
          <p>Esta pagina explica cada funcionalidade do sistema para que voce possa ter controle total sobre sua plataforma.</p>
        </div>
      </div>

      <div className="space-y-8">
        {pages.map((section) => (
          <div key={section.category}>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-color)]">
              {section.category}
            </h2>
            <div className="grid gap-4">
              {section.items.map((item) => (
                <div key={item.label} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5 hover:shadow-sm transition">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                      <item.icon size={20} className="text-purple-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-[var(--text-primary)]">{item.label}</h3>
                      <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Sobre os Cargos (Roles)</h2>
        <div className="grid gap-4">
          {[
            { role: 'OWNER', desc: 'Acesso total ao sistema. Pode gerenciar equipe, configuracoes, webhooks, permissoes e o painel admin global. Apenas o OWNER pode excluir usuarios.' },
            { role: 'ADMIN', desc: 'Acesso administrativo completo dentro do tenant. Pode gerenciar equipe, webhooks, configuracoes, mas nao tem acesso ao painel admin global.' },
            { role: 'SUPERVISOR', desc: 'Pode ler todos os modulos, escrever/editar conteudo, mas nao pode excluir. Ideal para supervisionar atendimentos.' },
            { role: 'OPERATOR', desc: 'Acesso basico de leitura. Pode atender conversas e tickets atribuidos. Nao pode alterar configuracoes do sistema.' },
          ].map(({ role, desc }) => (
            <div key={role} className="flex items-start gap-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                role === 'OWNER' ? 'bg-purple-100 text-purple-700' :
                role === 'ADMIN' ? 'bg-indigo-100 text-indigo-700' :
                role === 'SUPERVISOR' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-700'
              }`}>{role}</span>
              <p className="text-sm text-[var(--text-secondary)]">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
