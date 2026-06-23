import { z } from 'zod';
export declare const updateTicketSchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["PENDING", "OPEN", "CLOSED"]>>;
    assignedTo: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    queueId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status?: "PENDING" | "CLOSED" | "OPEN" | undefined;
    assignedTo?: string | null | undefined;
    queueId?: string | null | undefined;
}, {
    status?: "PENDING" | "CLOSED" | "OPEN" | undefined;
    assignedTo?: string | null | undefined;
    queueId?: string | null | undefined;
}>;
export declare const rateTicketSchema: z.ZodObject<{
    score: z.ZodNumber;
    comment: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    score: number;
    comment?: string | undefined;
}, {
    score: number;
    comment?: string | undefined;
}>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type RateTicketInput = z.infer<typeof rateTicketSchema>;
//# sourceMappingURL=ticket.d.ts.map