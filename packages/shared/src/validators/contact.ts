import { z } from 'zod';

export const createContactSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  phone: z.string().min(10, 'Telefone inválido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  cpfCnpj: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2, 'Use sigla do estado (ex: SP)').optional(),
  zipCode: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  notes: z.string().optional(),
});

export const updateContactSchema = createContactSchema.partial();

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
