import { Worker } from 'bullmq';
interface WhatsAppOutboundJobData {
    sessionId: string;
    tenantId: string;
    conversationId: string;
    jid: string;
    content: string;
    messageId: string;
    audioPath?: string;
}
export declare function startWhatsAppOutboundWorker(): Worker<WhatsAppOutboundJobData, any, string>;
export {};
