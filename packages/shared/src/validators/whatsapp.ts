import { z } from 'zod';

export const connectWhatsAppSchema = z.object({
  phoneNumber: z.string().min(10, 'Número de telefone inválido'),
});

export type ConnectWhatsAppInput = z.infer<typeof connectWhatsAppSchema>;
