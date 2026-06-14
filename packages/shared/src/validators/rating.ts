import { z } from 'zod';

export const createRatingSchema = z.object({
  score: z.number().int().min(1, 'Nota mínima: 1').max(5, 'Nota máxima: 5'),
  comment: z.string().max(1000, 'Comentário deve ter no máximo 1000 caracteres').optional(),
});

export type CreateRatingInput = z.infer<typeof createRatingSchema>;
