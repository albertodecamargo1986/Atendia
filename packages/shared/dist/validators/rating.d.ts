import { z } from 'zod';
export declare const createRatingSchema: z.ZodObject<{
    score: z.ZodNumber;
    comment: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    score: number;
    comment?: string | undefined;
}, {
    score: number;
    comment?: string | undefined;
}>;
export type CreateRatingInput = z.infer<typeof createRatingSchema>;
//# sourceMappingURL=rating.d.ts.map