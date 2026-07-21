export declare function getPlans(): Promise<{
    limits: import("@prisma/client/runtime/library").JsonValue;
    id: string;
    name: string;
    isActive: boolean;
    updatedAt: Date;
    description: string;
    planId: import(".prisma/client").$Enums.Plan;
    price: number;
    features: import("@prisma/client/runtime/library").JsonValue;
}[]>;
export declare function getPlan(planId: string): Promise<{
    limits: import("@prisma/client/runtime/library").JsonValue;
    id: string;
    name: string;
    isActive: boolean;
    updatedAt: Date;
    description: string;
    planId: import(".prisma/client").$Enums.Plan;
    price: number;
    features: import("@prisma/client/runtime/library").JsonValue;
} | null>;
export declare function updatePlan(planId: string, data: {
    name?: string;
    price?: number;
    description?: string;
    features?: string[];
    limits?: {
        maxAgents: number;
        maxWhatsapp: number;
        maxConversations: number;
        maxAiRequests: number;
        maxTeamMembers?: number;
    };
}): Promise<{
    limits: import("@prisma/client/runtime/library").JsonValue;
    id: string;
    name: string;
    isActive: boolean;
    updatedAt: Date;
    description: string;
    planId: import(".prisma/client").$Enums.Plan;
    price: number;
    features: import("@prisma/client/runtime/library").JsonValue;
}>;
export declare function syncPlanToMercadoPago(planId: string): Promise<{
    success: boolean;
    mpPlanId: string;
    price: number;
}>;
