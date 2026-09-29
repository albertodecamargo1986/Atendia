/**
 * Mapa único da navegação do painel.
 * Usado pelo menu lateral (Sidebar), pelas abas das seções (SectionLayout)
 * e pela busca rápida Ctrl+K (CommandPalette).
 */
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  LayoutDashboard, Headphones, Contact, MessageCircle, Bot, Megaphone,
  Smartphone, Users, Zap, FileBarChart, Settings, CreditCard, type LucideIcon,
} from 'lucide-react';
import { isOwnerOrAdmin, useAuthStore } from '../stores/auth';
import { hasModule, minimumPlanFor, PLAN_LABELS } from './plans';

/** Quem vê: todos, supervisor para cima, ou só dono/administrador. */
export type Audience = 'all' | 'supervisor' | 'manager';

export interface NavTab {
  to: string;
  label: string;
  /** padrão: o mesmo do item */
  audience?: Audience;
  /** módulo do plano (config/plans.ts do backend) */
  module?: string;
  /** palavras extras para a busca Ctrl+K */
  keywords?: string[];
}

export interface NavItem {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
  audience: Audience;
  module?: string;
  /** frase curta mostrada no topo da seção */
  description?: string;
  tabs?: NavTab[];
  keywords?: string[];
  /** outros caminhos que também acendem este item (ex.: /agents/new) */
  match?: string[];
  badge?: 'tickets' | 'internalChat';
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Atendimento',
    items: [
      {
        id: 'dashboard', to: '/', label: 'Painel', icon: LayoutDashboard, audience: 'all', module: 'dashboard',
        keywords: ['inicio', 'resumo', 'numeros', 'home'],
      },
      {
        id: 'tickets', to: '/tickets', label: 'Atendimentos', icon: Headphones, audience: 'all', module: 'tickets',
        match: ['/conversations'], badge: 'tickets',
        keywords: ['conversas', 'clientes', 'mensagens', 'aguardando', 'fila', 'whatsapp', 'responder', 'caixa de entrada'],
      },
      {
        id: 'contacts', to: '/contacts', label: 'Contatos', icon: Contact, audience: 'all', module: 'contacts',
        keywords: ['clientes', 'telefones', 'agenda', 'importar'],
      },
      {
        id: 'internal-chat', to: '/internal-chat', label: 'Chat da equipe', icon: MessageCircle, audience: 'all',
        module: 'internalChat', badge: 'internalChat',
        keywords: ['chat interno', 'colegas', 'mensagem interna', 'equipe'],
      },
    ],
  },
  {
    title: 'Inteligência artificial',
    items: [
      {
        id: 'ai', to: '/ai', label: 'Agentes de IA', icon: Bot, audience: 'manager', module: 'agents',
        description: 'Os robôs que respondem seus clientes, o que eles sabem e a voz deles.',
        match: ['/agents'],
        keywords: ['robo', 'bot', 'inteligencia artificial', 'assistente virtual'],
        tabs: [
          { to: '/ai/agents', label: 'Agentes', module: 'agents', keywords: ['robo', 'bot', 'criar agente'] },
          { to: '/ai/knowledge', label: 'Conhecimento', module: 'knowledge', keywords: ['base', 'documentos', 'pdf', 'site', 'treinar'] },
          { to: '/ai/voices', label: 'Vozes', module: 'voiceProfiles', keywords: ['audio', 'voz', 'gravar', 'clonar'] },
        ],
      },
      {
        id: 'campaigns', to: '/campaigns', label: 'Campanhas', icon: Megaphone, audience: 'manager', module: 'campaigns',
        keywords: ['disparo', 'envio em massa', 'marketing', 'promocao'],
      },
    ],
  },
  {
    title: 'Configurar atendimento',
    items: [
      {
        id: 'whatsapp', to: '/whatsapp', label: 'WhatsApp', icon: Smartphone, audience: 'manager', module: 'whatsapp',
        description: 'Os números conectados e o horário em que o atendimento automático funciona.',
        keywords: ['numero', 'celular', 'conectar', 'qr code'],
        tabs: [
          { to: '/whatsapp', label: 'Números', module: 'whatsapp', keywords: ['qr', 'conectar', 'celular', 'numero'] },
          { to: '/whatsapp/hours', label: 'Horário', module: 'businessHours', keywords: ['horario de atendimento', 'expediente', '24 horas', 'comercial'] },
        ],
      },
      {
        id: 'team', to: '/team', label: 'Equipe', icon: Users, audience: 'supervisor',
        description: 'As pessoas que atendem e as filas (departamentos) do atendimento.',
        keywords: ['usuarios', 'atendentes', 'funcionarios'],
        tabs: [
          { to: '/team', label: 'Pessoas', audience: 'manager', module: 'team', keywords: ['convidar', 'usuarios', 'permissoes'] },
          { to: '/team/queues', label: 'Filas', audience: 'supervisor', module: 'queues', keywords: ['departamentos', 'setores'] },
        ],
      },
      {
        id: 'shortcuts', to: '/shortcuts', label: 'Respostas e etiquetas', icon: Zap, audience: 'all',
        description: 'Mensagens prontas para responder mais rápido e etiquetas para organizar.',
        keywords: ['atalhos', 'modelos de mensagem'],
        tabs: [
          { to: '/shortcuts', label: 'Respostas rápidas', audience: 'all', module: 'quickReplies', keywords: ['atalho', 'mensagem pronta', 'modelo'] },
          { to: '/shortcuts/tags', label: 'Etiquetas', audience: 'manager', module: 'tags', keywords: ['tags', 'marcadores', 'cores'] },
        ],
      },
      {
        id: 'reports', to: '/reports', label: 'Relatórios', icon: FileBarChart, audience: 'supervisor', module: 'reports',
        keywords: ['graficos', 'desempenho', 'exportar', 'metricas'],
      },
    ],
  },
  {
    title: 'Conta',
    items: [
      {
        id: 'settings', to: '/settings', label: 'Configurações', icon: Settings, audience: 'all',
        description: 'Seus dados de acesso, a empresa, a chave da IA e as integrações.',
        keywords: ['conta', 'preferencias'],
        tabs: [
          { to: '/settings', label: 'Perfil', audience: 'all', keywords: ['senha', 'nome', 'email', 'duas etapas', '2fa', 'seguranca'] },
          { to: '/settings/company', label: 'Empresa', audience: 'manager', keywords: ['nome da empresa', 'plano'] },
          { to: '/settings/ai', label: 'Chave da IA', audience: 'manager', keywords: ['openai', 'anthropic', 'elevenlabs', 'api key', 'chave'] },
          { to: '/settings/integrations', label: 'Integrações', audience: 'manager', module: 'webhooks', keywords: ['webhook', 'crm', 'planilha', 'automacao'] },
        ],
      },
      {
        id: 'billing', to: '/billing', label: 'Plano e cobrança', icon: CreditCard, audience: 'manager',
        description: 'Seu plano atual, pagamentos e troca de plano.',
        keywords: ['assinatura', 'pagar', 'pagamento', 'fatura', 'cobranca'],
        tabs: [
          { to: '/billing', label: 'Meu plano', keywords: ['assinatura', 'historico de pagamentos'] },
          { to: '/billing/upgrade', label: 'Mudar plano', keywords: ['upgrade', 'contratar', 'pagar', 'plano pro'] },
        ],
      },
    ],
  },
];

export function canSee(audience: Audience | undefined, role?: string | null): boolean {
  if (!audience || audience === 'all') return true;
  if (audience === 'supervisor') return role === 'SUPERVISOR' || isOwnerOrAdmin(role);
  return isOwnerOrAdmin(role);
}

export function findNavItem(id: string): NavItem | undefined {
  for (const s of NAV_SECTIONS) {
    const it = s.items.find((i) => i.id === id);
    if (it) return it;
  }
  return undefined;
}

/** Abas que o papel pode ver (a audiência da aba nunca é mais aberta que a do item). */
export function visibleTabs(item: NavItem, role?: string | null): NavTab[] {
  if (!item.tabs) return [];
  return item.tabs.filter((t) => canSee(item.audience, role) && canSee(t.audience ?? item.audience, role));
}

export function isModuleLocked(plan: string | undefined | null, module?: string): boolean {
  return !!module && !hasModule(plan, module);
}

/** Item bloqueado: sem abas → módulo do item; com abas → todas as abas visíveis bloqueadas. */
export function isItemLocked(item: NavItem, role: string | undefined | null, plan: string | undefined | null): boolean {
  const tabs = visibleTabs(item, role);
  if (tabs.length === 0) return isModuleLocked(plan, item.module);
  return tabs.every((t) => isModuleLocked(plan, t.module));
}

/** Primeiro destino útil do item (primeira aba visível e liberada). */
export function itemHref(item: NavItem, role: string | undefined | null, plan: string | undefined | null): string {
  const tabs = visibleTabs(item, role);
  if (tabs.length === 0) return item.to;
  return (tabs.find((t) => !isModuleLocked(plan, t.module)) || tabs[0]).to;
}

/** O item fica aceso também nas abas filhas e nos caminhos extras (`match`). */
export function isItemActive(item: NavItem, pathname: string): boolean {
  const prefixes = [item.to, ...(item.match || [])];
  return prefixes.some((p) => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`)));
}

/** Módulo que o item/aba precisa, para montar a mensagem de "disponível no plano X". */
export function lockedModuleOf(item: NavItem, role?: string | null): string | undefined {
  if (item.module) return item.module;
  return visibleTabs(item, role).find((t) => t.module)?.module;
}

/** Remove acentos, para a busca achar "configuracoes" e "configurações". */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Abre a tela de troca de plano quando a pessoa clica em algo bloqueado.
 * Atendente/supervisor só recebe o aviso (não pode contratar).
 */
export function useOpenLocked() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  return (label: string, module?: string) => {
    const planNeeded = PLAN_LABELS[minimumPlanFor(module || '')] || 'Pro';
    if (isOwnerOrAdmin(role)) {
      toast.info(`${label}: disponível no plano ${planNeeded}.`);
      navigate('/billing/upgrade', { state: { lockedFeature: label, planNeeded } });
    } else {
      toast.info(`${label} está disponível no plano ${planNeeded}. Fale com o responsável pela conta.`);
    }
  };
}
