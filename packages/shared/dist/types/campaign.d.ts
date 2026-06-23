export interface Campaign {
    id: string;
    tenantId: string;
    name: string;
    message: string;
    status: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
    scheduledAt?: Date;
    startedAt?: Date;
    completedAt?: Date;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface CampaignContact {
    id: string;
    campaignId: string;
    contactId: string;
    status: 'PENDING' | 'SENT' | 'FAILED';
    sentAt?: Date;
    error?: string;
}
//# sourceMappingURL=campaign.d.ts.map