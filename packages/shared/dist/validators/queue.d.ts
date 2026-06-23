import { z } from 'zod';
export declare const createQueueSchema: z.ZodObject<{
    name: z.ZodString;
    color: z.ZodDefault<z.ZodString>;
    greetingMessage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    color: string;
    greetingMessage?: string | undefined;
}, {
    name: string;
    color?: string | undefined;
    greetingMessage?: string | undefined;
}>;
export declare const updateQueueSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    greetingMessage: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    color?: string | undefined;
    greetingMessage?: string | undefined;
}, {
    name?: string | undefined;
    color?: string | undefined;
    greetingMessage?: string | undefined;
}>;
export type CreateQueueInput = z.infer<typeof createQueueSchema>;
export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;
//# sourceMappingURL=queue.d.ts.map