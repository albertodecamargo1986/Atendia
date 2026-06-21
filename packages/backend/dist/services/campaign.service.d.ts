export declare function createCampaign(tenantId: string, name: string, message: string, contactIds: string[], scheduledAt?: Date): Promise<{
    recipients: {
        error: string | null;
        status: import(".prisma/client").$Enums.CampaignContactStatus;
        id: string;
        contactId: string;
        sentAt: Date | null;
        campaignId: string;
    }[];
} & {
    status: import(".prisma/client").$Enums.CampaignStatus;
    message: string;
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    scheduledAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
}>;
export declare function startCampaign(campaignId: string, tenantId: string): Promise<{
    started: boolean;
}>;
export declare function listCampaigns(tenantId: string): Promise<({
    _count: {
        recipients: number;
    };
} & {
    status: import(".prisma/client").$Enums.CampaignStatus;
    message: string;
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    scheduledAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
})[]>;
export declare function getCampaign(campaignId: string, tenantId: string): Promise<({
    recipients: ({
        contact: {
            id: string;
            name: string;
            phone: string;
        };
    } & {
        error: string | null;
        status: import(".prisma/client").$Enums.CampaignContactStatus;
        id: string;
        contactId: string;
        sentAt: Date | null;
        campaignId: string;
    })[];
} & {
    status: import(".prisma/client").$Enums.CampaignStatus;
    message: string;
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    scheduledAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
}) | null>;
export declare function cancelCampaign(campaignId: string, tenantId: string): Promise<{
    status: import(".prisma/client").$Enums.CampaignStatus;
    message: string;
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    scheduledAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
}>;
export declare function deleteCampaign(campaignId: string, tenantId: string): Promise<{
    status: import(".prisma/client").$Enums.CampaignStatus;
    message: string;
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    scheduledAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
}>;
export declare function markRecipientSent(recipientId: string): Promise<void>;
export declare function markRecipientFailed(recipientId: string, error: string): Promise<void>;
export declare function checkCampaignCompletion(campaignId: string): Promise<void>;
