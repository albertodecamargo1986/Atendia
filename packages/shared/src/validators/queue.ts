import { z } from 'zod';

export const createQueueSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida').default('#6366f1'),
  greetingMessage: z.string().optional(),
});

export const updateQueueSchema = createQueueSchema.partial();

export type CreateQueueInput = z.infer<typeof createQueueSchema>;
export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;
