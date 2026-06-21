import { z } from 'zod';
declare const createKnowledgeSchema: z.ZodObject<{
    agentId: z.ZodString;
    fileName: z.ZodOptional<z.ZodString>;
    fileType: z.ZodOptional<z.ZodString>;
    fileUrl: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    fileName?: string | undefined;
    fileType?: string | undefined;
    fileUrl?: string | undefined;
    content?: string | undefined;
}, {
    agentId: string;
    fileName?: string | undefined;
    fileType?: string | undefined;
    fileUrl?: string | undefined;
    content?: string | undefined;
}>;
export declare function listKnowledge(tenantId: string, agentId?: string): Promise<{
    id: string;
    createdAt: Date;
    tenantId: string;
    agentId: string;
    fileName: string;
    fileType: string;
    fileUrl: string;
    content: string | null;
    chunkCount: number;
}[]>;
export declare function getKnowledge(tenantId: string, knowledgeId: string): Promise<{
    id: string;
    createdAt: Date;
    tenantId: string;
    agentId: string;
    fileName: string;
    fileType: string;
    fileUrl: string;
    content: string | null;
    chunkCount: number;
}>;
export declare function createKnowledge(tenantId: string, data: z.infer<typeof createKnowledgeSchema>): Promise<{
    id: string;
    createdAt: Date;
    tenantId: string;
    agentId: string;
    fileName: string;
    fileType: string;
    fileUrl: string;
    content: string | null;
    chunkCount: number;
}>;
export declare function createKnowledgeFromFile(tenantId: string, agentId: string, file: Express.Multer.File): Promise<{
    id: string;
    createdAt: Date;
    tenantId: string;
    agentId: string;
    fileName: string;
    fileType: string;
    fileUrl: string;
    content: string | null;
    chunkCount: number;
}>;
export declare function deleteKnowledge(tenantId: string, knowledgeId: string): Promise<{
    id: string;
    createdAt: Date;
    tenantId: string;
    agentId: string;
    fileName: string;
    fileType: string;
    fileUrl: string;
    content: string | null;
    chunkCount: number;
}>;
export declare function getAgentContext(agentId: string, tenantId: string): Promise<string>;
export {};
