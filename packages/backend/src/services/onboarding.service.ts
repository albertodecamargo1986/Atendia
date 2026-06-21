import prisma from '../lib/prisma.js';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  skippable: boolean;
  route?: string;
}

export async function getOnboardingProgress(tenantId: string): Promise<{
  steps: OnboardingStep[];
  progress: number;
  isComplete: boolean;
}> {
  const [agents, whatsappSessions, businessHours, users] = await Promise.all([
    prisma.agent.count({ where: { tenantId } }),
    prisma.whatsAppSession.count({ where: { tenantId } }),
    prisma.businessHour.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, isActive: true } }),
  ]);

  const steps: OnboardingStep[] = [
    {
      id: 'create_agent',
      title: 'Criar seu primeiro agente de IA',
      description: 'Configure um agente com personalidade e regras para atender clientes automaticamente.',
      completed: agents > 0,
      skippable: false,
      route: '/agents/new',
    },
    {
      id: 'connect_whatsapp',
      title: 'Conectar WhatsApp',
      description: 'Conecte um número de WhatsApp para começar a receber mensagens.',
      completed: whatsappSessions > 0,
      skippable: false,
      route: '/whatsapp',
    },
    {
      id: 'set_business_hours',
      title: 'Configurar horários de funcionamento',
      description: 'Defina os horários que sua empresa atende para que o sistema saiba quando responder.',
      completed: businessHours > 0,
      skippable: true,
      route: '/business-hours',
    },
    {
      id: 'invite_team',
      title: 'Convidar equipe',
      description: 'Adicione atendentes humanos para gerenciar conversas que precisam de intervenção.',
      completed: users > 1,
      skippable: true,
      route: '/team',
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const mandatoryCompleted = steps
    .filter((s) => !s.skippable)
    .every((s) => s.completed);
  // Considera completo se todos os steps obrigatórios foram feitos
  const isComplete = mandatoryCompleted;

  return {
    steps,
    progress: Math.round((completedCount / steps.length) * 100),
    isComplete,
  };
}
