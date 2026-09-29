import api from '../services/api';

export interface PublicPlan {
  id: string;
  key: string;
  name: string;
  description: string;
  priceMonthly: number;
  features: string[];
  limits: Record<string, number>;
  highlighted: boolean;
}

/** Nomes amigáveis dos módulos (ids de config/plans.ts do backend). */
export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Painel com números do atendimento',
  tickets: 'Atendimentos organizados',
  conversations: 'Conversas do WhatsApp com IA',
  contacts: 'Cadastro de contatos',
  agents: 'Agentes de IA',
  whatsapp: 'Conexão com WhatsApp',
  businessHours: 'Horário de funcionamento',
  settings: 'Configurações',
  queues: 'Filas de atendimento',
  tags: 'Etiquetas',
  quickReplies: 'Respostas rápidas',
  team: 'Equipe de atendentes',
  campaigns: 'Campanhas de mensagens',
  voiceProfiles: 'Respostas em áudio (voz)',
  webhooks: 'Integrações (webhooks)',
  reports: 'Relatórios',
  internalChat: 'Chat interno da equipe',
  knowledge: 'Base de conhecimento',
  '*': 'Todos os recursos',
};

export const LIMIT_LABELS: Record<string, string> = {
  maxAgents: 'agente(s) de IA',
  maxWhatsapp: 'número(s) de WhatsApp',
  maxConversations: 'conversas por mês',
  maxAiRequests: 'respostas da IA por mês',
  maxTeamMembers: 'pessoa(s) na equipe',
};

export const FALLBACK_PLANS: PublicPlan[] = [
  {
    id: 'FREE', key: 'FREE', name: 'Grátis', description: 'Para testar sem compromisso', priceMonthly: 0, highlighted: false,
    features: ['conversations', 'agents', 'whatsapp', 'contacts', 'businessHours'],
    limits: { maxAgents: 1, maxWhatsapp: 1, maxConversations: 100, maxTeamMembers: 1 },
  },
  {
    id: 'STARTER', key: 'STARTER', name: 'Starter', description: 'Para pequenos negócios', priceMonthly: 147, highlighted: false,
    features: ['conversations', 'agents', 'whatsapp', 'contacts', 'queues', 'tags', 'quickReplies', 'team', 'businessHours'],
    limits: { maxAgents: 3, maxWhatsapp: 2, maxConversations: 1000, maxTeamMembers: 5 },
  },
  {
    id: 'PRO', key: 'PRO', name: 'Pro', description: 'Para equipes em crescimento', priceMonthly: 381, highlighted: true,
    features: ['conversations', 'agents', 'whatsapp', 'team', 'campaigns', 'voiceProfiles', 'reports', 'internalChat', 'knowledge', 'webhooks'],
    limits: { maxAgents: 10, maxWhatsapp: 5, maxConversations: 10000, maxTeamMembers: 20 },
  },
  {
    id: 'ENTERPRISE', key: 'ENTERPRISE', name: 'Enterprise', description: 'Sem limites', priceMonthly: 1044, highlighted: false,
    features: ['*'],
    limits: { maxAgents: -1, maxWhatsapp: -1, maxConversations: -1, maxTeamMembers: -1 },
  },
];

function normalize(p: any): PublicPlan {
  const key = String(p.key || p.planId || p.id || '').toUpperCase();
  const features = Array.isArray(p.features) ? p.features.map(String) : [];
  return {
    id: String(p.id || key),
    key,
    name: String(p.name || key),
    description: String(p.description || ''),
    priceMonthly: Number(p.priceMonthly ?? p.price ?? 0),
    features,
    limits: (p.limits && typeof p.limits === 'object') ? p.limits : {},
    highlighted: !!(p.highlighted ?? key === 'PRO'),
  };
}

/** GET /public/plans (rota pública). Em caso de falha, usa a tabela padrão. */
export async function fetchPublicPlans(): Promise<{ plans: PublicPlan[]; fromServer: boolean }> {
  try {
    const { data } = await api.get('/public/plans');
    const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.plans) ? data.plans : [];
    if (list.length) {
      const order = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'];
      const plans = list.map(normalize).sort((a: PublicPlan, b: PublicPlan) => order.indexOf(a.key) - order.indexOf(b.key));
      return { plans, fromServer: true };
    }
  } catch { /* usa a tabela padrão */ }
  return { plans: FALLBACK_PLANS, fromServer: false };
}

export function featureLabel(f: string): string {
  return MODULE_LABELS[f] || f;
}

export function limitLines(limits: Record<string, number>): string[] {
  return Object.entries(limits)
    .filter(([k]) => LIMIT_LABELS[k])
    .map(([k, v]) => (v === -1 ? `Ilimitado: ${LIMIT_LABELS[k]}` : `${v.toLocaleString('pt-BR')} ${LIMIT_LABELS[k]}`));
}

/**
 * Linhas exibidas no cartão do plano. Se o servidor já manda os recursos escritos
 * por extenso (ex.: "3 agentes de IA"), usa só eles — senão os limites apareceriam
 * duplicados. Se vierem ids de módulo, gera as linhas de limite + nomes amigáveis.
 */
export function planBullets(plan: PublicPlan): string[] {
  const allModuleIds = plan.features.length > 0 && plan.features.every((f) => f in MODULE_LABELS);
  if (plan.features.length && !allModuleIds) return plan.features;
  return [...limitLines(plan.limits), ...plan.features.map(featureLabel)];
}

export function formatPrice(v: number): string {
  if (!v) return 'Grátis';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
