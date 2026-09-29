import { z } from 'zod';

export const connectWhatsAppSchema = z.object({
  agentId: z.string().uuid().nullable().optional(),
});

/** PATCH /api/whatsapp/:id — agente que atende o número (null = primeiro agente ativo) */
export const updateWhatsAppSessionSchema = z.object({
  agentId: z.string().uuid().nullable(),
});

export type ConnectWhatsAppInput = z.infer<typeof connectWhatsAppSchema>;
export type UpdateWhatsAppSessionInput = z.infer<typeof updateWhatsAppSessionSchema>;
