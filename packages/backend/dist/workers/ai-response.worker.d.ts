import { Worker } from 'bullmq';
interface AIResponseJobData {
    agentId: string;
    tenantId: string;
    conversationId: string;
    messages: {
        role: string;
        content: string;
    }[];
}
export declare function startAIResponseWorker(): Worker<AIResponseJobData, any, string>;
export {};
