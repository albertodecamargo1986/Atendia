import { z } from 'zod';

/**
 * Política única de senha do AtendIA (cadastro, convite, reset, troca de senha, admin).
 * Mínimo 8 caracteres, ao menos 1 letra e 1 número.
 * O LOGIN não usa este schema — senhas antigas mais fracas continuam entrando.
 */
export const passwordSchema = z
  .string({ required_error: 'Senha é obrigatória' })
  .min(8, 'Senha deve ter no mínimo 8 caracteres')
  .max(128, 'Senha deve ter no máximo 128 caracteres')
  .regex(/[A-Za-z]/, 'Senha deve conter ao menos uma letra')
  .regex(/[0-9]/, 'Senha deve conter ao menos um número');
