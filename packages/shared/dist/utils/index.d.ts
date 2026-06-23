export declare function formatPhone(phone: string): string;
export declare function truncate(str: string, maxLen: number): string;
export declare function sleep(ms: number): Promise<void>;
export declare function daysAgo(n: number): Date;
export declare const TICKET_STATUS_LABELS: Record<string, string>;
export declare const CONVERSATION_STATUS_LABELS: Record<string, string>;
export declare const ROLE_LABELS: Record<string, string>;
export declare const CHANNEL_LABELS: Record<string, string>;
export declare const WEBHOOK_EVENTS: readonly ["ticket.created", "ticket.closed", "ticket.assigned", "message.received", "message.sent", "conversation.created", "conversation.resolved", "conversation.human_takeover"];
//# sourceMappingURL=index.d.ts.map