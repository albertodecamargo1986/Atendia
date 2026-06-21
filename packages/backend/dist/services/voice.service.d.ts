export declare function transcribeAudio(filePath: string, tenantId: string): Promise<string>;
export declare function generateAudioResponse(text: string, voiceId: string, tenantId: string, provider?: 'elevenlabs' | 'openai'): Promise<string>;
export declare function downloadWhatsAppAudio(sock: any, msg: any): Promise<{
    filePath: string;
    fileName: string;
} | null>;
