export declare function testToken(token: string): Promise<{
    valid: boolean;
    id: any;
    name: any;
    email: any;
}>;
export declare function createPreapprovalPlan(token: string, plan: {
    id: string;
    name: string;
    price: number;
    description: string;
    successUrl: string;
}): Promise<any>;
export declare function createSubscription(token: string, data: {
    preapprovalPlanId: string;
    payerEmail: string;
    tenantId: string;
    plan: string;
    cardTokenId?: string;
}): Promise<any>;
export declare function handleSubscriptionWebhook(body: any): Promise<{
    received: boolean;
    type: string;
    error?: undefined;
    plan?: undefined;
    status?: undefined;
} | {
    received: boolean;
    error: string;
    type?: undefined;
    plan?: undefined;
    status?: undefined;
} | {
    received: boolean;
    plan: string;
    status: any;
    type?: undefined;
    error?: undefined;
}>;
export declare function setupAllPlans(token: string): Promise<any[]>;
export declare function saveConfig(tenantId: string, data: {
    accessToken: string;
    isSandbox: boolean;
    preapprovalPlanStarterId: string;
    preapprovalPlanProId: string;
    preapprovalPlanEnterpriseId: string;
    isActive: boolean;
}): Promise<{
    accessToken: string;
    id: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    isSandbox: boolean;
    preapprovalPlanStarterId: string | null;
    preapprovalPlanProId: string | null;
    preapprovalPlanEnterpriseId: string | null;
}>;
export declare function getStatus(tenantId: string): Promise<{
    configured: boolean;
    currentPlanId?: undefined;
    preapprovalPlanStarterId?: undefined;
    preapprovalPlanProId?: undefined;
    preapprovalPlanEnterpriseId?: undefined;
    isSandbox?: undefined;
    createdAt?: undefined;
    updatedAt?: undefined;
} | {
    configured: boolean;
    currentPlanId: string;
    preapprovalPlanStarterId: string | null;
    preapprovalPlanProId: string | null;
    preapprovalPlanEnterpriseId: string | null;
    isSandbox: boolean;
    createdAt: Date;
    updatedAt: Date;
}>;
