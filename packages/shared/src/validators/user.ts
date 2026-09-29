import { z } from 'zod';
import { passwordSchema } from './auth.js';

export const createUserSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: passwordSchema,
  // OWNER e SUPER_ADMIN não são criados por convite
  role: z.enum(['ADMIN', 'SUPERVISOR', 'OPERATOR']).default('OPERATOR'),
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
