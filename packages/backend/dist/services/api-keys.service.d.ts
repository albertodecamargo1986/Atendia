export declare function listApiKeys(tenantId: string): Promise<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
    provider: import(".prisma/client").$Enums.ApiKeyProvider;
    isValid: boolean;
    lastTestedAt: Date | null;
}[]>;
export declare function getDecryptedKey(tenantId: string, provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS'): Promise<string | null>;
export declare function saveApiKey(tenantId: string, provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS', key: string): Promise<{
    id: string;
    provider: "OPENAI" | "ANTHROPIC" | "ELEVENLABS";
    isValid: boolean;
    lastTestedAt: Date;
}>;
export declare function deleteApiKey(tenantId: string, provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS'): Promise<void>;
export declare function testApiKey(provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS', key: string): Promise<{
    valid: boolean;
    error?: string;
}>;
export declare function testExistingKey(tenantId: string, provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS'): Promise<{
    valid: boolean;
    error?: string;
}>;
