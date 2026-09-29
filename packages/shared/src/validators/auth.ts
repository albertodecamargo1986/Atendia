import { z } from 'zod';

/**
 * Política única de senha (igual à do backend): mínimo 8 caracteres,
 * ao menos 1 letra e 1 número. Usada em cadastro, convite e troca/reset de senha.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Senha deve ter no mínimo 8 caracteres')
  .max(128, 'Senha deve ter no máximo 128 caracteres')
  .regex(/[A-Za-z]/, 'Senha deve conter ao menos uma letra')
  .regex(/[0-9]/, 'Senha deve conter ao menos um número');

/** Login NÃO valida força de senha (senhas antigas continuam funcionando). */
export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: passwordSchema,
  tenantName: z.string().min(2, 'Nome da empresa deve ter no mínimo 2 caracteres'),
  // Opcional: o backend gera automaticamente a partir do nome da empresa
  tenantSlug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Identificador deve conter apenas letras minúsculas, números e hífens')
    .optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
