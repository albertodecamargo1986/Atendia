export interface VoiceProfile {
    id: string;
    tenantId: string;
    name: string;
    provider: 'elevenlabs' | 'openai';
    voiceId: string;
    isDefault: boolean;
    sampleUrl?: string;
    createdAt: string;
    updatedAt: string;
}
//# sourceMappingURL=voice-profile.d.ts.map