export declare function findOrCreateTicket(tenantId: string, contactId: string, conversationId: string, whatsappSessionId: string | null, unreadCount: number, lastMessage: string, isGroup: boolean): Promise<({
    conversation: {
        agent: {
            id: string;
            name: string;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            tenantId: string;
            description: string | null;
            model: string;
            systemPrompt: string;
            temperature: number;
            toneOfVoice: string;
            language: string;
            customPrompt: string | null;
            responseDelayMinMs: number;
            responseDelayMaxMs: number;
            sendAudioFrequency: number;
            voiceProfileId: string | null;
            isDraft: boolean;
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
    };
    contact: {
        role: string | null;
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        tenantId: string;
        cpfCnpj: string | null;
        phone: string;
        isGroup: boolean;
        profilePicUrl: string | null;
        lid: string | null;
        address: string | null;
        city: string | null;
        state: string | null;
        zipCode: string | null;
        company: string | null;
        notes: string | null;
    };
    queue: {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        tenantId: string;
        color: string;
        greetingMessage: string | null;
    } | null;
    assignee: {
        role: import(".prisma/client").$Enums.Role;
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        tenantId: string;
        passwordHash: string;
        avatarUrl: string | null;
        emailVerified: boolean;
        twoFactorEnabled: boolean;
        twoFactorSecret: string | null;
    } | null;
} & {
    status: import(".prisma/client").$Enums.TicketStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    contactId: string;
    assignedTo: string | null;
    conversationId: string;
    queueId: string | null;
    whatsappSessionId: string | null;
    unreadMessages: number;
    lastMessage: string | null;
    isGroup: boolean;
    closedAt: Date | null;
}) | null>;
export declare function listTickets(tenantId: string, filters?: {
    status?: string;
    queueId?: string;
    assignedTo?: string;
    search?: string;
    page?: number;
    withUnreadMessages?: boolean;
}): Promise<{
    tickets: ({
        conversation: {
            id: string;
            agent: {
                id: string;
                name: string;
            };
            channel: import(".prisma/client").$Enums.Channel;
        };
        contact: {
            id: string;
            name: string;
            phone: string;
            profilePicUrl: string | null;
        };
        queue: {
            id: string;
            name: string;
            color: string;
        } | null;
        assignee: {
            id: string;
            name: string;
        } | null;
        ticketTags: ({
            tag: {
                id: string;
                name: string;
                color: string;
            };
        } & {
            id: string;
            ticketId: string;
            tagId: string;
        })[];
    } & {
        status: import(".prisma/client").$Enums.TicketStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        tenantId: string;
        contactId: string;
        assignedTo: string | null;
        conversationId: string;
        queueId: string | null;
        whatsappSessionId: string | null;
        unreadMessages: number;
        lastMessage: string | null;
        isGroup: boolean;
        closedAt: Date | null;
    })[];
    count: number;
    hasMore: boolean;
}>;
export declare function getTicket(tenantId: string, ticketId: string): Promise<{
    conversation: {
        agent: {
            id: string;
            name: string;
        };
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
    };
    contact: {
        role: string | null;
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        tenantId: string;
        cpfCnpj: string | null;
        phone: string;
        isGroup: boolean;
        profilePicUrl: string | null;
        lid: string | null;
        address: string | null;
        city: string | null;
        state: string | null;
        zipCode: string | null;
        company: string | null;
        notes: string | null;
    };
    queue: {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        tenantId: string;
        color: string;
        greetingMessage: string | null;
    } | null;
    assignee: {
        id: string;
        name: string;
        email: string;
    } | null;
    ticketTags: ({
        tag: {
            id: string;
            name: string;
            color: string;
        };
    } & {
        id: string;
        ticketId: string;
        tagId: string;
    })[];
} & {
    status: import(".prisma/client").$Enums.TicketStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    contactId: string;
    assignedTo: string | null;
    conversationId: string;
    queueId: string | null;
    whatsappSessionId: string | null;
    unreadMessages: number;
    lastMessage: string | null;
    isGroup: boolean;
    closedAt: Date | null;
}>;
export declare function updateTicket(tenantId: string, ticketId: string, data: {
    status?: string;
    assignedTo?: string | null;
    queueId?: string | null;
}): Promise<{
    contact: {
        id: string;
        name: string;
        phone: string;
        profilePicUrl: string | null;
    };
    queue: {
        id: string;
        name: string;
        color: string;
    } | null;
    assignee: {
        id: string;
        name: string;
    } | null;
} & {
    status: import(".prisma/client").$Enums.TicketStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    contactId: string;
    assignedTo: string | null;
    conversationId: string;
    queueId: string | null;
    whatsappSessionId: string | null;
    unreadMessages: number;
    lastMessage: string | null;
    isGroup: boolean;
    closedAt: Date | null;
}>;
export declare function acceptTicket(tenantId: string, ticketId: string, userId: string): Promise<{
    contact: {
        id: string;
        name: string;
        phone: string;
        profilePicUrl: string | null;
    };
    queue: {
        id: string;
        name: string;
        color: string;
    } | null;
    assignee: {
        id: string;
        name: string;
    } | null;
} & {
    status: import(".prisma/client").$Enums.TicketStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    contactId: string;
    assignedTo: string | null;
    conversationId: string;
    queueId: string | null;
    whatsappSessionId: string | null;
    unreadMessages: number;
    lastMessage: string | null;
    isGroup: boolean;
    closedAt: Date | null;
}>;
export declare function closeTicket(tenantId: string, ticketId: string): Promise<{
    contact: {
        id: string;
        name: string;
        phone: string;
        profilePicUrl: string | null;
    };
    queue: {
        id: string;
        name: string;
        color: string;
    } | null;
    assignee: {
        id: string;
        name: string;
    } | null;
} & {
    status: import(".prisma/client").$Enums.TicketStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    contactId: string;
    assignedTo: string | null;
    conversationId: string;
    queueId: string | null;
    whatsappSessionId: string | null;
    unreadMessages: number;
    lastMessage: string | null;
    isGroup: boolean;
    closedAt: Date | null;
}>;
export declare function reopenTicket(tenantId: string, ticketId: string): Promise<{
    contact: {
        id: string;
        name: string;
        phone: string;
        profilePicUrl: string | null;
    };
    queue: {
        id: string;
        name: string;
        color: string;
    } | null;
    assignee: {
        id: string;
        name: string;
    } | null;
} & {
    status: import(".prisma/client").$Enums.TicketStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    contactId: string;
    assignedTo: string | null;
    conversationId: string;
    queueId: string | null;
    whatsappSessionId: string | null;
    unreadMessages: number;
    lastMessage: string | null;
    isGroup: boolean;
    closedAt: Date | null;
}>;
export declare function markAsRead(tenantId: string, ticketId: string): Promise<{
    status: import(".prisma/client").$Enums.TicketStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    contactId: string;
    assignedTo: string | null;
    conversationId: string;
    queueId: string | null;
    whatsappSessionId: string | null;
    unreadMessages: number;
    lastMessage: string | null;
    isGroup: boolean;
    closedAt: Date | null;
}>;
export declare function getTicketStats(tenantId: string): Promise<{
    pending: number;
    open: number;
    closed: number;
    total: number;
    withUnread: number;
}>;
export declare function getTicketCountByQueue(tenantId: string): Promise<{
    id: string;
    name: string;
    color: string;
    count: number;
}[]>;
