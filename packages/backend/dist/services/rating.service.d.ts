export declare function rateTicket(ticketId: string, tenantId: string, score: number, comment?: string): Promise<{
    id: string;
    createdAt: Date;
    ticketId: string;
    score: number;
    comment: string | null;
}>;
export declare function getRating(ticketId: string, tenantId: string): Promise<{
    id: string;
    createdAt: Date;
    ticketId: string;
    score: number;
    comment: string | null;
} | null>;
export declare function getRatingsSummary(tenantId: string): Promise<{
    total: number;
    average: number;
    distribution: Record<number, number>;
}>;
