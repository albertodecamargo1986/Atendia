import { Worker } from 'bullmq';
interface OffHoursMessageJobData {
    tenantId: string;
    conversationId: string;
    agentName: string;
}
export declare function startOffHoursMessageWorker(): Worker<OffHoursMessageJobData, any, string>;
export {};
