import { z } from 'zod';
export declare const createWebhookSchema: z.ZodObject<{
    url: z.ZodString;
    events: z.ZodArray<z.ZodString, "many">;
    secret: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    url: string;
    events: string[];
    secret?: string | undefined;
}, {
    url: string;
    events: string[];
    secret?: string | undefined;
}>;
export declare const updateWebhookSchema: z.ZodObject<{
    url: z.ZodOptional<z.ZodString>;
    events: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    secret: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    url?: string | undefined;
    events?: string[] | undefined;
    secret?: string | undefined;
}, {
    url?: string | undefined;
    events?: string[] | undefined;
    secret?: string | undefined;
}>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
//# sourceMappingURL=webhook.d.ts.map