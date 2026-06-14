import { z } from 'zod';

export const createAgentSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  description: z.string().optional(),
  model: z.enum(['gpt-4o-mini', 'gpt-4o', 'claude-3-haiku', 'claude-3-sonnet'], {
    errorMap: () => ({ message: 'Modelo inválido' }),
  }),
  systemPrompt: z.string().min(10, 'Prompt deve ter no mínimo 10 caracteres'),
  temperature: z.number().min(0).max(2).default(0.7),
  toneOfVoice: z.string().default('amigavel'),
  language: z.string().default('pt-BR'),
  customPrompt: z.string().optional(),
  responseDelayMinMs: z.number().int().min(0).max(30000).default(1000),
  responseDelayMaxMs: z.number().int().min(0).max(30000).default(4000),
  sendAudioFrequency: z.number().int().min(0).max(20).default(3),
  voiceProfileId: z.string().optional(),
});

export const updateAgentSchema = createAgentSchema.partial();

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
