import { Readable } from 'stream';
export declare function getReportData(tenantId: string, startDate?: Date, endDate?: Date, page?: number, limit?: number): Promise<{
    tickets: {
        status: import(".prisma/client").$Enums.TicketStatus;
        id: string;
        createdAt: Date;
        unreadMessages: number;
        closedAt: Date | null;
        contact: {
            name: string;
            phone: string;
        };
        assignee: {
            name: string;
        } | null;
        rating: {
            score: number;
            comment: string | null;
        } | null;
    }[];
    conversations: {
        status: import(".prisma/client").$Enums.ConversationStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        _count: {
            messages: number;
        };
        channel: import(".prisma/client").$Enums.Channel;
        contactName: string;
    }[];
    ratings: {
        createdAt: Date;
        ticketId: string;
        score: number;
        comment: string | null;
    }[];
    pagination: {
        page: number;
        limit: number;
        ticketCount: number;
        conversationCount: number;
        ratingCount: number;
    };
}>;
/**
 * Stream CSV export using cursor-based pagination.
 * Yields chunks of CSV text — the route pipes the Readable into the response.
 */
export declare function streamCSV(tenantId: string, type: 'tickets' | 'conversations' | 'ratings', startDate?: Date, endDate?: Date): Readable;
export declare function exportCSV(tenantId: string, type: 'tickets' | 'conversations' | 'ratings', startDate?: Date, endDate?: Date): Promise<string>;
