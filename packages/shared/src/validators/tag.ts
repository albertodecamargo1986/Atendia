import { z } from 'zod';

export const createTagSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida').default('#6366f1'),
});

export const updateTagSchema = createTagSchema.partial();

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
