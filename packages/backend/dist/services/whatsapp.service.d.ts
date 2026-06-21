import { z } from 'zod';
declare const connectSchema: z.ZodObject<{
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    sessionId?: string | undefined;
}, {
    sessionId?: string | undefined;
}>;
export declare function listSessions(tenantId: string): Promise<{
    status: import(".prisma/client").$Enums.WhatsappStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    phoneNumber: string;
    sessionId: string;
    credentials: Buffer | null;
    lastConnectedAt: Date | null;
}[]>;
export declare function getSession(tenantId: string, sessionId: string): Promise<{
    status: import(".prisma/client").$Enums.WhatsappStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    phoneNumber: string;
    sessionId: string;
    credentials: Buffer | null;
    lastConnectedAt: Date | null;
}>;
export declare function connectSession(tenantId: string, data?: z.infer<typeof connectSchema>): Promise<{
    status: import(".prisma/client").$Enums.WhatsappStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    phoneNumber: string;
    sessionId: string;
    credentials: Buffer | null;
    lastConnectedAt: Date | null;
}>;
export declare function sendWhatsAppMessage(sessionId: string, jid: string, content: string): Promise<import("@whiskeysockets/baileys", { with: { "resolution-mode": "import" } }).proto.WebMessageInfo | undefined>;
export declare function sendWhatsAppAudio(sessionId: string, jid: string, audioPath: string): Promise<import("@whiskeysockets/baileys", { with: { "resolution-mode": "import" } }).proto.WebMessageInfo | undefined>;
export declare function reconnectSession(tenantId: string, sessionId: string): Promise<{
    status: import(".prisma/client").$Enums.WhatsappStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    phoneNumber: string;
    sessionId: string;
    credentials: Buffer | null;
    lastConnectedAt: Date | null;
} | null>;
export declare function disconnectSession(tenantId: string, sessionId: string): Promise<{
    status: import(".prisma/client").$Enums.WhatsappStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    phoneNumber: string;
    sessionId: string;
    credentials: Buffer | null;
    lastConnectedAt: Date | null;
}>;
export declare function getSessionStatus(tenantId: string, sessionId: string): Promise<{
    status: import(".prisma/client").$Enums.WhatsappStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    phoneNumber: string;
    sessionId: string;
    credentials: Buffer | null;
    lastConnectedAt: Date | null;
}>;
export declare function deleteSession(tenantId: string, sessionId: string): Promise<void>;
export declare function reconnectAllSessions(): Promise<number>;
export {};
