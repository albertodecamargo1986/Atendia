import { z } from 'zod';
export declare const connectWhatsAppSchema: z.ZodObject<{
    phoneNumber: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phoneNumber: string;
}, {
    phoneNumber: string;
}>;
export type ConnectWhatsAppInput = z.infer<typeof connectWhatsAppSchema>;
//# sourceMappingURL=whatsapp.d.ts.map