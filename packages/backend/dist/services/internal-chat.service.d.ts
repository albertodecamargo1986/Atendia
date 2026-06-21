export declare function sendMessage(tenantId: string, senderId: string, receiverId: string | null, groupId: string | null, content: string): Promise<{
    sender: {
        id: string;
        name: string;
        avatarUrl: string | null;
    };
    receiver: {
        id: string;
        name: string;
        avatarUrl: string | null;
    } | null;
} & {
    id: string;
    createdAt: Date;
    tenantId: string;
    content: string;
    groupId: string | null;
    readAt: Date | null;
    senderId: string;
    receiverId: string | null;
}>;
export declare function getDirectMessages(tenantId: string, userId1: string, userId2: string, page?: number, limit?: number): Promise<{
    messages: ({
        sender: {
            id: string;
            name: string;
            avatarUrl: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        tenantId: string;
        content: string;
        groupId: string | null;
        readAt: Date | null;
        senderId: string;
        receiverId: string | null;
    })[];
    total: number;
}>;
export declare function getGroupMessages(tenantId: string, groupId: string, page?: number, limit?: number): Promise<{
    messages: ({
        sender: {
            id: string;
            name: string;
            avatarUrl: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        tenantId: string;
        content: string;
        groupId: string | null;
        readAt: Date | null;
        senderId: string;
        receiverId: string | null;
    })[];
    total: number;
}>;
export declare function markAsRead(messageId: string, tenantId: string, userId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
export declare function getUnreadCount(userId: string, tenantId: string): Promise<number>;
