import { Worker } from 'bullmq';
interface SendCampaignMessageData {
    campaignId: string;
    tenantId: string;
    recipientId: string;
    contactId: string;
    contactPhone: string;
    message: string;
}
interface SendCampaignData {
    campaignId: string;
    tenantId: string;
}
type CampaignJobData = SendCampaignMessageData | SendCampaignData;
export declare function startCampaignWorker(): Worker<CampaignJobData, any, string>;
export {};
