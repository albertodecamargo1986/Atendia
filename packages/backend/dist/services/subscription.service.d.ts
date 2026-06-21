export declare function updateTenantPlan(tenantId: string, plan: string): Promise<{
    id: string;
    slug: string;
    name: string;
    plan: import(".prisma/client").$Enums.Plan;
    isActive: boolean;
    maxAgents: number;
    maxConversations: number;
    maxWhatsapp: number;
    maxAiRequests: number;
    trialEndAt: Date | null;
    trialUsed: boolean;
    createdAt: Date;
    updatedAt: Date;
}>;
