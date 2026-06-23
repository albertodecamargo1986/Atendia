import { z } from 'zod';
export declare const createQuickReplySchema: z.ZodObject<{
    shortcode: z.ZodString;
    content: z.ZodString;
    category: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    content: string;
    shortcode: string;
    category?: string | undefined;
}, {
    content: string;
    shortcode: string;
    category?: string | undefined;
}>;
export declare const updateQuickReplySchema: z.ZodObject<{
    shortcode: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    content?: string | undefined;
    shortcode?: string | undefined;
    category?: string | undefined;
}, {
    content?: string | undefined;
    shortcode?: string | undefined;
    category?: string | undefined;
}>;
export type CreateQuickReplyInput = z.infer<typeof createQuickReplySchema>;
export type UpdateQuickReplyInput = z.infer<typeof updateQuickReplySchema>;
//# sourceMappingURL=quick-reply.d.ts.map