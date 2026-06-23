export interface WhatsAppSession {
    id: string;
    tenantId: string;
    phoneNumber: string;
    sessionId: string;
    status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'BANNED';
    lastConnectedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=whatsapp.d.ts.map