import { z } from 'zod';
export declare const createVoiceProfileSchema: z.ZodObject<{
    name: z.ZodString;
    provider: z.ZodDefault<z.ZodEnum<["elevenlabs", "openai"]>>;
    voiceId: z.ZodString;
    isDefault: z.ZodDefault<z.ZodBoolean>;
    sampleUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    provider: "elevenlabs" | "openai";
    voiceId: string;
    isDefault: boolean;
    sampleUrl?: string | undefined;
}, {
    name: string;
    voiceId: string;
    provider?: "elevenlabs" | "openai" | undefined;
    isDefault?: boolean | undefined;
    sampleUrl?: string | undefined;
}>;
export declare const updateVoiceProfileSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    provider: z.ZodOptional<z.ZodDefault<z.ZodEnum<["elevenlabs", "openai"]>>>;
    voiceId: z.ZodOptional<z.ZodString>;
    isDefault: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sampleUrl: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    provider?: "elevenlabs" | "openai" | undefined;
    voiceId?: string | undefined;
    isDefault?: boolean | undefined;
    sampleUrl?: string | undefined;
}, {
    name?: string | undefined;
    provider?: "elevenlabs" | "openai" | undefined;
    voiceId?: string | undefined;
    isDefault?: boolean | undefined;
    sampleUrl?: string | undefined;
}>;
export type CreateVoiceProfileInput = z.infer<typeof createVoiceProfileSchema>;
export type UpdateVoiceProfileInput = z.infer<typeof updateVoiceProfileSchema>;
//# sourceMappingURL=voice-profile.d.ts.map