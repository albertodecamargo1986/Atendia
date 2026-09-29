export interface WhatsAppSession {
  id: string;
  tenantId: string;
  /** null enquanto o QR Code não foi lido */
  phoneNumber: string | null;
  sessionId: string;
  status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'BANNED';
  /** Agente que atende este número (null = primeiro agente ativo) */
  agentId?: string | null;
  lastConnectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
