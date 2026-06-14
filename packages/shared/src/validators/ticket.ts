import { z } from 'zod';

export const updateTicketSchema = z.object({
  status: z.enum(['PENDING', 'OPEN', 'CLOSED']).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  queueId: z.string().uuid().optional().nullable(),
});

export const rateTicketSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type RateTicketInput = z.infer<typeof rateTicketSchema>;
