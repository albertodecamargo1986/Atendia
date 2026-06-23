import { z } from 'zod';
export declare const createCampaignSchema: z.ZodObject<{
    name: z.ZodString;
    message: z.ZodString;
    contactIds: z.ZodArray<z.ZodString, "many">;
    scheduledAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    name: string;
    contactIds: string[];
    scheduledAt?: string | undefined;
}, {
    message: string;
    name: string;
    contactIds: string[];
    scheduledAt?: string | undefined;
}>;
export declare const updateCampaignSchema: z.ZodObject<Omit<{
    name: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    contactIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    scheduledAt: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "contactIds">, "strip", z.ZodTypeAny, {
    message?: string | undefined;
    name?: string | undefined;
    scheduledAt?: string | undefined;
}, {
    message?: string | undefined;
    name?: string | undefined;
    scheduledAt?: string | undefined;
}>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
//# sourceMappingURL=campaign.d.ts.map