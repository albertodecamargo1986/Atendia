import { z } from 'zod';
declare const createQueueSchema: z.ZodObject<{
    name: z.ZodString;
    color: z.ZodDefault<z.ZodString>;
    greetingMessage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    color: string;
    greetingMessage?: string | undefined;
}, {
    name: string;
    color?: string | undefined;
    greetingMessage?: string | undefined;
}>;
declare const updateQueueSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    greetingMessage: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    color?: string | undefined;
    greetingMessage?: string | null | undefined;
}, {
    name?: string | undefined;
    color?: string | undefined;
    greetingMessage?: string | null | undefined;
}>;
export declare function createQueue(tenantId: string, data: z.infer<typeof createQueueSchema>): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    color: string;
    greetingMessage: string | null;
}>;
export declare function updateQueue(tenantId: string, queueId: string, data: z.infer<typeof updateQueueSchema>): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    color: string;
    greetingMessage: string | null;
}>;
export declare function deleteQueue(tenantId: string, queueId: string): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    color: string;
    greetingMessage: string | null;
}>;
export declare function listQueues(tenantId: string): Promise<{
    id: string;
    name: string;
    color: string;
    greetingMessage: string | null;
    ticketCount: number;
    users: {
        id: string;
        name: string;
        email: string;
    }[];
    whatsapps: {
        status: import(".prisma/client").$Enums.WhatsappStatus;
        id: string;
        phoneNumber: string;
    }[];
}[]>;
export declare function addUserToQueue(userId: string, queueId: string): Promise<{
    id: string;
    userId: string;
    queueId: string;
}>;
export declare function removeUserFromQueue(userId: string, queueId: string): Promise<{
    id: string;
    userId: string;
    queueId: string;
} | null>;
export declare function addWhatsappToQueue(whatsappSessionId: string, queueId: string): Promise<{
    id: string;
    queueId: string;
    whatsappSessionId: string;
}>;
export declare function removeWhatsappFromQueue(whatsappSessionId: string, queueId: string): Promise<{
    id: string;
    queueId: string;
    whatsappSessionId: string;
} | null>;
export declare function getQueueForWhatsapp(tenantId: string, whatsappSessionId: string): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    tenantId: string;
    color: string;
    greetingMessage: string | null;
} | null>;
export {};
