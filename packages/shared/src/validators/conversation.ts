import { z } from 'zod';

export const createConversationSchema = z.object({
  agentId: z.string().uuid(),
  channel: z.enum(['WHATSAPP', 'WEB', 'TELEGRAM', 'INSTAGRAM']),
  contactName: z.string().min(1),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Mensagem não pode estar vazia'),
  mediaUrl: z.string().optional(),
  mediaType: z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT']).optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
