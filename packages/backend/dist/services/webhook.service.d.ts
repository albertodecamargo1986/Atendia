export declare function createWebhook(tenantId: string, url: string, events: string[], secret?: string): Promise<{
    id: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    secret: string;
    tenantId: string;
    url: string;
    events: string[];
}>;
export declare function listWebhooks(tenantId: string): Promise<({
    _count: {
        deliveries: number;
    };
} & {
    id: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    secret: string;
    tenantId: string;
    url: string;
    events: string[];
})[]>;
export declare function updateWebhook(webhookId: string, tenantId: string, data: {
    url?: string;
    events?: string[];
    isActive?: boolean;
}): Promise<{
    id: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    secret: string;
    tenantId: string;
    url: string;
    events: string[];
}>;
export declare function deleteWebhook(webhookId: string, tenantId: string): Promise<{
    id: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    secret: string;
    tenantId: string;
    url: string;
    events: string[];
}>;
export declare function testWebhook(webhookId: string, tenantId: string): Promise<{
    success: boolean;
    statusCode: number | null;
    response: string;
}>;
export declare function triggerEvent(tenantId: string, event: string, data: Record<string, unknown>): Promise<{
    total: number;
    succeeded: number;
    failed: number;
}>;
export declare function getDeliveries(webhookId: string, tenantId: string, limit?: number): Promise<{
    event: string;
    id: string;
    createdAt: Date;
    attempts: number;
    success: boolean;
    payload: import("@prisma/client/runtime/library").JsonValue;
    statusCode: number | null;
    response: string | null;
    webhookId: string;
}[]>;
