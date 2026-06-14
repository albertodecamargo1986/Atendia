import { z } from 'zod';

export const createVoiceProfileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  provider: z.enum(['elevenlabs', 'openai']).default('elevenlabs'),
  voiceId: z.string().min(1, 'Voice ID é obrigatório'),
  isDefault: z.boolean().default(false),
  sampleUrl: z.string().url().optional(),
});

export const updateVoiceProfileSchema = createVoiceProfileSchema.partial();

export type CreateVoiceProfileInput = z.infer<typeof createVoiceProfileSchema>;
export type UpdateVoiceProfileInput = z.infer<typeof updateVoiceProfileSchema>;
