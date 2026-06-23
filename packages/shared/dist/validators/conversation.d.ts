import { z } from 'zod';
export declare const createConversationSchema: z.ZodObject<{
    agentId: z.ZodString;
    channel: z.ZodEnum<["WHATSAPP", "WEB", "TELEGRAM", "INSTAGRAM"]>;
    contactName: z.ZodString;
    contactPhone: z.ZodOptional<z.ZodString>;
    contactEmail: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    channel: "WHATSAPP" | "WEB" | "TELEGRAM" | "INSTAGRAM";
    contactName: string;
    contactPhone?: string | undefined;
    contactEmail?: string | undefined;
}, {
    agentId: string;
    channel: "WHATSAPP" | "WEB" | "TELEGRAM" | "INSTAGRAM";
    contactName: string;
    contactPhone?: string | undefined;
    contactEmail?: string | undefined;
}>;
export declare const sendMessageSchema: z.ZodObject<{
    content: z.ZodString;
    mediaUrl: z.ZodOptional<z.ZodString>;
    mediaType: z.ZodOptional<z.ZodEnum<["IMAGE", "AUDIO", "VIDEO", "DOCUMENT"]>>;
}, "strip", z.ZodTypeAny, {
    content: string;
    mediaUrl?: string | undefined;
    mediaType?: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" | undefined;
}, {
    content: string;
    mediaUrl?: string | undefined;
    mediaType?: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" | undefined;
}>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
//# sourceMappingURL=conversation.d.ts.map