import { z } from 'zod';
declare const sendMessageSchema: z.ZodObject<{
    content: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<["USER", "ASSISTANT", "SYSTEM"]>>;
    mediaUrl: z.ZodOptional<z.ZodString>;
    mediaType: z.ZodOptional<z.ZodEnum<["IMAGE", "AUDIO", "VIDEO", "DOCUMENT"]>>;
}, "strip", z.ZodTypeAny, {
    role: "USER" | "ASSISTANT" | "SYSTEM";
    content: string;
    mediaUrl?: string | undefined;
    mediaType?: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" | undefined;
}, {
    content: string;
    role?: "USER" | "ASSISTANT" | "SYSTEM" | undefined;
    mediaUrl?: string | undefined;
    mediaType?: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" | undefined;
}>;
export declare function createConversation(tenantId: string, data: {
    channel: string;
    contactName: string;
    contactEmail?: string;
    agentId?: string;
}): Promise<{
    _count: {
        messages: number;
    };
    agent: {
        id: string;
        name: string;
        model: string;
    };
} & {
    status: import(".prisma/client").$Enums.ConversationStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    agentId: string;
    channel: import(".prisma/client").$Enums.Channel;
    contactId: string | null;
    contactName: string;
    contactPhone: string | null;
    contactEmail: string | null;
    assignedTo: string | null;
}>;
export declare function listConversations(tenantId: string, filters?: {
    status?: string;
    agentId?: string;
    page?: number;
}): Promise<{
    conversations: ({
        _count: {
            messages: number;
        };
        agent: {
            id: string;
            name: string;
        };
        operator: {
            id: string;
            name: string;
        } | null;
    } & {
        status: import(".prisma/client").$Enums.ConversationStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        tenantId: string;
        agentId: string;
        channel: import(".prisma/client").$Enums.Channel;
        contactId: string | null;
        contactName: string;
        contactPhone: string | null;
        contactEmail: string | null;
        assignedTo: string | null;
    })[];
    count: number;
    hasMore: boolean;
}>;
export declare function getConversation(tenantId: string, conversationId: string): Promise<{
    agent: {
        id: string;
        name: string;
        model: string;
    };
    operator: {
        id: string;
        name: string;
    } | null;
    messages: {
        role: import(".prisma/client").$Enums.MessageRole;
        id: string;
        createdAt: Date;
        content: string;
        conversationId: string;
        mediaUrl: string | null;
        mediaType: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }[];
} & {
    status: import(".prisma/client").$Enums.ConversationStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    agentId: string;
    channel: import(".prisma/client").$Enums.Channel;
    contactId: string | null;
    contactName: string;
    contactPhone: string | null;
    contactEmail: string | null;
    assignedTo: string | null;
}>;
export declare function sendMessage(tenantId: string, conversationId: string, data: z.infer<typeof sendMessageSchema>, userId?: string): Promise<{
    role: import(".prisma/client").$Enums.MessageRole;
    id: string;
    createdAt: Date;
    content: string;
    conversationId: string;
    mediaUrl: string | null;
    mediaType: string | null;
    metadata: import("@prisma/client/runtime/library").JsonValue | null;
}>;
export declare function escalateConversation(tenantId: string, conversationId: string, userId: string): Promise<{
    status: import(".prisma/client").$Enums.ConversationStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    agentId: string;
    channel: import(".prisma/client").$Enums.Channel;
    contactId: string | null;
    contactName: string;
    contactPhone: string | null;
    contactEmail: string | null;
    assignedTo: string | null;
}>;
export declare function returnToAgent(tenantId: string, conversationId: string): Promise<{
    status: import(".prisma/client").$Enums.ConversationStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    agentId: string;
    channel: import(".prisma/client").$Enums.Channel;
    contactId: string | null;
    contactName: string;
    contactPhone: string | null;
    contactEmail: string | null;
    assignedTo: string | null;
}>;
export declare function transferConversation(tenantId: string, conversationId: string, toUserId: string): Promise<{
    status: import(".prisma/client").$Enums.ConversationStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    agentId: string;
    channel: import(".prisma/client").$Enums.Channel;
    contactId: string | null;
    contactName: string;
    contactPhone: string | null;
    contactEmail: string | null;
    assignedTo: string | null;
}>;
export declare function addInternalNote(tenantId: string, conversationId: string, content: string, userId: string): Promise<{
    role: import(".prisma/client").$Enums.MessageRole;
    id: string;
    createdAt: Date;
    content: string;
    conversationId: string;
    mediaUrl: string | null;
    mediaType: string | null;
    metadata: import("@prisma/client/runtime/library").JsonValue | null;
}>;
export declare function resolveConversation(tenantId: string, conversationId: string): Promise<{
    status: import(".prisma/client").$Enums.ConversationStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    agentId: string;
    channel: import(".prisma/client").$Enums.Channel;
    contactId: string | null;
    contactName: string;
    contactPhone: string | null;
    contactEmail: string | null;
    assignedTo: string | null;
}>;
export declare function deleteConversation(tenantId: string, conversationId: string): Promise<void>;
export declare function getConversationStats(tenantId: string): Promise<{
    active: number;
    pending: number;
    resolved: number;
    takeover: number;
    total: number;
}>;
export declare function getDailyStats(tenantId: string, days?: number): Promise<{
    conversations: number;
    tickets: number;
    resolved: number;
    date: string;
}[]>;
export {};
