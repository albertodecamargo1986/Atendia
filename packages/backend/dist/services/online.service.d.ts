export declare function heartbeat(userId: string, tenantId: string): Promise<void>;
export declare function getOnlineUsers(tenantId?: string): Promise<{
    userId: string;
    lastSeen: string;
}[] | {
    tenantId: string;
    users: {
        userId: string;
        lastSeen: string;
    }[];
}[]>;
export declare function getOnlineCount(): Promise<number>;
export declare function removeFromOnline(userId: string, tenantId: string): Promise<void>;
