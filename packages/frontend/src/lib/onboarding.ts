import api from '../services/api';

export interface OnboardingSteps {
  company: boolean;
  whatsapp: boolean;
  aiKey: boolean;
  agent: boolean;
  businessHours: boolean;
}

export interface OnboardingProgress {
  steps: OnboardingSteps;
  completed: boolean;
  completedAt: string | null;
}

const EMPTY: OnboardingSteps = { company: true, whatsapp: false, aiKey: false, agent: false, businessHours: false };

/**
 * Lê GET /onboarding/progress no formato do contrato:
 * { steps: { company, whatsapp, aiKey, agent, businessHours }, completed, completedAt }.
 * Também aceita o formato antigo (lista de passos) para não quebrar durante a migração.
 */
export async function fetchOnboardingProgress(): Promise<OnboardingProgress> {
  const { data } = await api.get('/onboarding/progress');
  if (data && data.steps && !Array.isArray(data.steps)) {
    return {
      steps: { ...EMPTY, ...data.steps },
      completed: !!data.completed,
      completedAt: data.completedAt ?? null,
    };
  }
  // Formato antigo: [{ id, completed }]
  const list: Array<{ id: string; completed: boolean }> = Array.isArray(data?.steps) ? data.steps : [];
  const done = (id: string) => !!list.find((s) => s.id === id)?.completed;
  return {
    steps: {
      company: true,
      whatsapp: done('connect_whatsapp'),
      aiKey: false,
      agent: done('create_agent'),
      businessHours: done('set_business_hours'),
    },
    completed: !!data?.isComplete,
    completedAt: null,
  };
}

export const ONBOARDING_DISMISSED_KEY = 'atendia_onboarding_dismissed';
