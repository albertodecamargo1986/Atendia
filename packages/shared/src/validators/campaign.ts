import { z } from 'zod';

export const createCampaignSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  message: z.string().min(1, 'Mensagem é obrigatória'),
  contactIds: z.array(z.string().uuid()).min(1, 'Selecione ao menos um contato'),
  scheduledAt: z.string().optional(),
});

export const updateCampaignSchema = createCampaignSchema.partial().omit({ contactIds: true });

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
