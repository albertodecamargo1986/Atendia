import { z } from 'zod';
declare const businessHourSchema: z.ZodObject<{
    dayOfWeek: z.ZodNumber;
    isOpen: z.ZodBoolean;
    openTime: z.ZodOptional<z.ZodString>;
    closeTime: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    dayOfWeek: number;
    isOpen: boolean;
    openTime?: string | undefined;
    closeTime?: string | undefined;
}, {
    dayOfWeek: number;
    isOpen: boolean;
    openTime?: string | undefined;
    closeTime?: string | undefined;
}>;
export declare function listBusinessHours(tenantId: string): Promise<{
    id: string;
    tenantId: string;
    dayOfWeek: number;
    isOpen: boolean;
    openTime: string | null;
    closeTime: string | null;
}[]>;
export declare function updateBusinessHour(tenantId: string, dayOfWeek: number, data: z.infer<typeof businessHourSchema>): Promise<{
    id: string;
    tenantId: string;
    dayOfWeek: number;
    isOpen: boolean;
    openTime: string | null;
    closeTime: string | null;
}>;
export declare function isWithinBusinessHours(tenantId: string): Promise<boolean>;
export {};
