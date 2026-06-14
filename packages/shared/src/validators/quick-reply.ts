import { z } from 'zod';

export const createQuickReplySchema = z.object({
  shortcode: z.string().min(1, 'Shortcode é obrigatório'),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  category: z.string().optional(),
});

export const updateQuickReplySchema = createQuickReplySchema.partial();

export type CreateQuickReplyInput = z.infer<typeof createQuickReplySchema>;
export type UpdateQuickReplyInput = z.infer<typeof updateQuickReplySchema>;
