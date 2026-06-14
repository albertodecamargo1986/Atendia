import { z } from 'zod';

export const createWebhookSchema = z.object({
  url: z.string().url('URL inválida'),
  events: z.array(z.string()).min(1, 'Selecione ao menos um evento'),
  secret: z.string().min(8, 'Secret deve ter no mínimo 8 caracteres').optional(),
});

export const updateWebhookSchema = createWebhookSchema.partial();

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
