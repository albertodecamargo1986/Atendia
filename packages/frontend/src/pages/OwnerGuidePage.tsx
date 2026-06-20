import {
  BookOpen, BarChart3, Ticket, Bot, MessageSquare, Contact, Layers, Tag, Zap,
  Megaphone, Mic, Webhook, FileBarChart, MessageCircle,
  Smartphone, Clock, Users, Key, Settings, Shield, Building2, CreditCard,
  AlertTriangle, ExternalLink, Globe, Activity, Lock, Wifi,
} from 'lucide-react';

const pages = [
  {
    category: 'Atendimento',
    items: [
      { icon: Ticket, label: 'Tickets', desc: 'Gerencie os chamados de atendimento. Visualize tickets pendentes, em atendimento e fechados. Atribua operadores, edite status e acompanhe o histórico completo de cada atendimento.' },
      { icon: MessageSquare, label: 'Conversas', desc: 'Acompanhe conversas em tempo real com clientes. As conversas podem ser gerenciadas pelo agente IA ou por um atendente humano. Você pode assumir o controle manual, transferir para outro operador, resolver ou fechar a conversa. Todas as mensagens ficam registradas.' },
      { icon: Contact, label: 'Contatos', desc: 'Base de contatos dos clientes. Cadastre nome, telefone, e-mail, CPF/CNPJ, endereço completo, empresa e cargo. Você pode criar contatos manualmente ou salvar rapidamente a partir de uma conversa. Veja o histórico de tickets de cada contato.' },
    ],
  },
  {
    category: 'Configuração do Sistema',
    items: [
      { icon: Bot, label: 'Agentes', desc: 'Crie e configure agentes de IA. Defina o prompt do sistema, tom de voz, modelo (GPT-4o, Claude, etc.), temperatura e regras de escalonamento. Você pode ter múltiplos agentes por empresa, cada um com sua personalidade e base de conhecimento.' },
      { icon: BookOpen, label: 'Conhecimento', desc: 'Base de conhecimento dos agentes. Faça upload de documentos (PDF, TXT) que os agentes de IA usarão para responder perguntas com precisão. Os documentos são processados e indexados automaticamente.' },
      { icon: Layers, label: 'Filas', desc: 'Organize tickets e atendimentos por assunto ou prioridade. Crie filas como "Suporte", "Vendas" ou "Financeiro" e associe operadores a cada fila.' },
      { icon: Tag, label: 'Tags', desc: 'Crie etiquetas coloridas para categorizar tickets. Útil para filtrar, organizar e gerar relatórios por categoria.' },
      { icon: Zap, label: 'Respostas Rápidas', desc: 'Crie atalhos de texto para respostas frequentes. Use tokens como {{nome}} e {{empresa}} para personalizar. Economiza tempo em mensagens comuns e garante consistência.' },
      { icon: Smartphone, label: 'WhatsApp', desc: 'Conecte números de WhatsApp ao sistema via QR Code. Cada sessão pode ser associada a filas específicas. Acompanhe o status (conectado, desconectado, banido) e reconecte quando necessário. Múltiplos números por empresa (dependendo do plano).' },
      { icon: Clock, label: 'Horários', desc: 'Configure horários de funcionamento por dia da semana. Fora do horário comercial, mensagens automáticas de "fora do expediente" são enviadas e as conversas ficam como pendentes até o próximo dia útil.' },
      { icon: Mic, label: 'Vozes', desc: 'Configure perfis de voz para síntese de fala (TTS) usando ElevenLabs. Defina qual voz cada agente de IA usará ao enviar áudios.' },
      { icon: Megaphone, label: 'Campanhas', desc: 'Crie campanhas de disparo em massa de mensagens para contatos. Agende disparos, acompanhe entregas e taxas de sucesso.' },
    ],
  },
  {
    category: 'Equipe e Administração',
    items: [
      { icon: Users, label: 'Equipe', desc: 'Gerencie membros da equipe. Cadastre, ative/desative, altere cargos (OWNER, ADMIN, SUPERVISOR, OPERATOR). Cada cargo tem níveis de acesso diferentes.' },
      { icon: MessageCircle, label: 'Chat Interno', desc: 'Comunique-se com outros membros da equipe em tempo real sem sair do sistema. Ideal para coordenar atendimentos.' },
      { icon: FileBarChart, label: 'Relatórios', desc: 'Métricas e relatórios de atendimento: volume de conversas e tickets, desempenho dos agentes, tempo médio de resposta, distribuição por canal e mais.' },
      { icon: BarChart3, label: 'Dashboard', desc: 'Visão geral do sistema com métricas principais: tickets abertos/pendentes/fechados, total de conversas, agentes ativos, uso de IA, status do WhatsApp.' },
      { icon: Key, label: 'Licença', desc: 'Status da sua licença, informações de ativação, plano contratado e validade.' },
    ],
  },
  {
    category: 'Área Administrativa (OWNER/ADMIN)',
    items: [
      { icon: Webhook, label: 'Webhooks', desc: 'Integre o AtendIA com sistemas externos. Quando eventos acontecem (novo ticket, mensagem recebida, contato criado, etc.), enviamos uma requisição HTTP para a URL que você configurar, com um payload contendo os dados do evento. Webhooks são a principal forma de integrar com sistemas de CRM, ERP ou automações externas.' },
      { icon: Settings, label: 'Configurações', desc: 'Configure chaves de API (OpenAI, Anthropic, ElevenLabs), altere seu perfil, senha e gerencie autenticação de dois fatores (2FA) para maior segurança.' },
    ],
  },
  {
    category: 'Painel Admin Global',
    items: [
      { icon: Building2, label: 'Clientes (Admin)', desc: 'Visualize e gerencie todos os tenants (empresas/clientes) do sistema. Altere planos, ative/desative, ajuste limites de agentes, conversas, WhatsApp e requisições de IA.' },
      { icon: Key, label: 'Licenças (Admin)', desc: 'Gerencie todas as licenças emitidas no sistema. Crie novas licenças, revogue ativas, acompanhe prazos de expiração.' },
      { icon: CreditCard, label: 'Pagamentos (Admin)', desc: 'Histórico completo de todos os pagamentos recebidos. Veja valores, planos, status e dados dos clientes.' },
      { icon: Shield, label: 'Permissões (Admin)', desc: 'Configure permissões granulares por cargo (role) e módulo. Cada cargo pode ter permissões de Leitura (R), Escrita (W) e Exclusão (D) em cada módulo do sistema.' },
      { icon: Wifi, label: 'Online (Admin)', desc: 'Veja quem está online agora no sistema. Acompanhe usuários ativos por tenant.' },
      { icon: Globe, label: 'Owner Guide', desc: 'Esta página! Documentação completa para orientar o uso do sistema.' },
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
            <p className="text-sm text-[var(--text-secondary)]">Documentação completa do sistema AtendIA</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 mb-8">
          <p className="font-medium mb-1">👑 Visível apenas para OWNER</p>
          <p>Esta página explica cada funcionalidade do sistema para que você tenha controle total sobre sua plataforma.</p>
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

      {/* Seção: Webhooks em Detalhe */}
      <div className="mt-8 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <Webhook size={20} className="text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">O que são Webhooks?</h2>
        </div>

        <div className="space-y-4 text-sm text-[var(--text-secondary)] leading-relaxed">
          <p>
            <strong className="text-[var(--text-primary)]">Webhook</strong> é uma forma de um sistema avisar outro sistema
            quando algo acontece. Pense como uma <strong className="text-[var(--text-primary)]">notificação automática</strong>:
            quando um evento ocorre no AtendIA, ele envia uma requisição HTTP para uma URL que você configurou.
          </p>

          <div className="bg-[var(--surface-secondary)] rounded-lg p-4">
            <p className="font-medium text-[var(--text-primary)] mb-2">📋 Exemplos de uso:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Enviar dados de <strong>novo ticket</strong> para seu CRM</li>
              <li>Notificar seu sistema quando uma <strong>mensagem for recebida</strong></li>
              <li>Disparar automações quando um <strong>contato for criado</strong></li>
              <li>Registrar <strong>entregas de campanha</strong> em um sistema externo</li>
              <li>Sincronizar <strong>status de pagamento</strong> com seu ERP</li>
            </ul>
          </div>

          <div className="bg-[var(--surface-secondary)] rounded-lg p-4">
            <p className="font-medium text-[var(--text-primary)] mb-2">🔔 Eventos disponíveis:</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                'ticket.created', 'ticket.updated', 'ticket.closed',
                'message.received', 'message.sent',
                'contact.created', 'contact.updated',
                'conversation.started', 'conversation.resolved',
                'campaign.sent', 'campaign.completed',
                'payment.received', 'payment.failed',
              ].map(event => (
                <code key={event} className="bg-[var(--surface-primary)] px-2 py-1 rounded text-xs font-mono text-[var(--text-primary)]">
                  {event}
                </code>
              ))}
            </div>
          </div>

          <div className="bg-[var(--surface-secondary)] rounded-lg p-4">
            <p className="font-medium text-[var(--text-primary)] mb-2">🔒 Segurança:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Cada webhook tem um <strong>secreto único</strong> gerado automaticamente</li>
              <li>As requisições são assinadas com <strong>HMAC-SHA256</strong> no header <code className="text-xs bg-gray-100 px-1 rounded">X-AtendIA-Signature</code></li>
              <li>Você pode verificar a assinatura para garantir que a requisição veio do AtendIA</li>
              <li>URLs para IPs privados (localhost, 10.x, 192.168.x) são bloqueadas por segurança</li>
              <li>Timeout de 10 segundos por requisição</li>
            </ul>
          </div>

          <div className="bg-[var(--surface-secondary)] rounded-lg p-4">
            <p className="font-medium text-[var(--text-primary)] mb-2">📦 Exemplo de payload:</p>
            <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs overflow-x-auto mt-2">
{`{
  "event": "ticket.created",
  "data": {
    "ticketId": "uuid-do-ticket",
    "contactName": "João Silva",
    "contactPhone": "5511999999999",
    "status": "PENDING",
    "queueName": "Suporte"
  },
  "timestamp": "2026-06-20T14:30:00.000Z"
}`}
            </pre>
          </div>
        </div>
      </div>

      {/* Seção: Cargos e Permissões */}
      <div className="mt-8 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
            <Shield size={20} className="text-purple-600" />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Cargos e Permissões</h2>
        </div>

        <div className="grid gap-4">
          {[
            { role: '👑 OWNER', desc: 'Acesso total ao sistema. Pode gerenciar equipe, configurações, webhooks, permissões e o painel admin global. Apenas o OWNER pode excluir usuários e alterar o plano da empresa. Também tem acesso ao Guia do Owner.' },
            { role: '🔷 ADMIN', desc: 'Acesso administrativo completo dentro do tenant (empresa). Pode gerenciar equipe, webhooks, configurações e permissões. NÃO tem acesso ao painel admin global (outras empresas).' },
            { role: '🟦 SUPERVISOR', desc: 'Pode ler todos os módulos, escrever/editar conteúdo, mas NÃO pode excluir. Ideal para supervisionar atendimentos e garantir qualidade.' },
            { role: '🟢 OPERATOR', desc: 'Acesso básico de leitura. Pode atender conversas e tickets atribuídos, usar respostas rápidas e chat interno. NÃO pode alterar configurações do sistema.' },
          ].map(({ role, desc }) => (
            <div key={role} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--surface-secondary)]">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                role.includes('OWNER') ? 'bg-purple-100 text-purple-700' :
                role.includes('ADMIN') ? 'bg-indigo-100 text-indigo-700' :
                role.includes('SUPERVISOR') ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-700'
              }`}>{role}</span>
              <p className="text-sm text-[var(--text-secondary)]">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Seção: Estrutura do Sistema */}
      <div className="mt-8 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Activity size={20} className="text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Estrutura do Sistema</h2>
        </div>

        <div className="space-y-4 text-sm text-[var(--text-secondary)] leading-relaxed">
          <p>
            O AtendIA é organizado em <strong className="text-[var(--text-primary)]">três áreas principais</strong>:
          </p>

          <div className="grid gap-3">
            <div className="bg-[var(--surface-secondary)] rounded-lg p-4">
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">1️⃣ Sistema do Cliente</h3>
              <p>O que o usuário final vê e usa no dia a dia: Dashboard, Tickets, Conversas, Contatos, Agentes, WhatsApp, Configurações. Cada empresa (tenant) tem seu próprio ambiente isolado.</p>
            </div>
            <div className="bg-[var(--surface-secondary)] rounded-lg p-4">
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">2️⃣ Área Administrativa</h3>
              <p>Acesso via menu "Admin" na sidebar. Restrito a OWNER e ADMIN. Inclui: Gestão de clientes (tenants), licenças, pagamentos, permissões, webhooks e usuários online. O Guia do Owner também fica aqui.</p>
            </div>
            <div className="bg-[var(--surface-secondary)] rounded-lg p-4">
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">3️⃣ Painel do Owner</h3>
              <p>Você está aqui! Documentação e guia completo do sistema. Apenas o OWNER da empresa tem acesso a esta página.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Seção: Dicas de Segurança */}
      <div className="mt-8 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
            <Lock size={20} className="text-red-600" />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Dicas de Segurança</h2>
        </div>

        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
          {[
            { icon: Users, label: 'Gerencie acessos', desc: 'Conceda apenas o cargo mínimo necessário para cada membro da equipe.' },
            { icon: Shield, label: 'Ative 2FA', desc: 'Habilite autenticação de dois fatores em Configurações para proteger sua conta.' },
            { icon: Key, label: 'Senhas fortes', desc: 'Use senhas com no mínimo 8 caracteres, incluindo maiúsculas, números e caracteres especiais.' },
            { icon: Webhook, label: 'Webhooks seguros', desc: 'Sempre verifique a assinatura HMAC nos webhooks recebidos para confirmar que vieram do AtendIA.' },
            { icon: AlertTriangle, label: 'Cuidado com dados', desc: 'Nunca compartilhe tokens de API, chaves secretas ou senhas em canais não seguros.' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3">
              <Icon size={16} className="text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-[var(--text-primary)]">{label}</p>
                <p className="text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
