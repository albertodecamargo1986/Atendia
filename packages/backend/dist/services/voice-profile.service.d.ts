import { z } from 'zod';
declare const createVoiceProfileSchema: z.ZodObject<{
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
declare const updateVoiceProfileSchema: z.ZodObject<{
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
export declare function listVoiceProfiles(tenantId: string): Promise<({
    _count: {
        agents: number;
    };
} & {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    provider: string;
    voiceId: string;
    isDefault: boolean;
    sampleUrl: string | null;
})[]>;
export declare function getVoiceProfile(tenantId: string, profileId: string): Promise<{
    agents: {
        id: string;
        name: string;
    }[];
} & {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    provider: string;
    voiceId: string;
    isDefault: boolean;
    sampleUrl: string | null;
}>;
export declare function createVoiceProfile(tenantId: string, data: z.infer<typeof createVoiceProfileSchema>): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    provider: string;
    voiceId: string;
    isDefault: boolean;
    sampleUrl: string | null;
}>;
export declare function updateVoiceProfile(tenantId: string, profileId: string, data: z.infer<typeof updateVoiceProfileSchema>): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    provider: string;
    voiceId: string;
    isDefault: boolean;
    sampleUrl: string | null;
}>;
export declare function deleteVoiceProfile(tenantId: string, profileId: string): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    provider: string;
    voiceId: string;
    isDefault: boolean;
    sampleUrl: string | null;
}>;
export declare function testVoiceProfile(tenantId: string, profileId: string): Promise<string>;
export declare function cloneVoiceFromAudio(tenantId: string, name: string, files: Express.Multer.File[]): Promise<{
    voiceId: string;
    profile: any;
}>;
export {};
