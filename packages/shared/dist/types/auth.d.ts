export interface Tenant {
    id: string;
    name: string;
    slug: string;
    plan: 'free' | 'pro' | 'enterprise';
    maxAgents: number;
    maxConversations: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface Agent {
    id: string;
    tenantId: string;
    name: string;
    description?: string;
    model: string;
    systemPrompt: string;
    temperature: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface KnowledgeBase {
    id: string;
    tenantId: string;
    agentId: string;
    fileName: string;
    fileType: string;
    fileUrl: string;
    chunkCount: number;
    createdAt: Date;
}
//# sourceMappingURL=auth.d.ts.map