declare const MODEL_MAP: Record<string, string>;
export declare function generateResponse(agentId: string, tenantId: string, conversationMessages: {
    role: string;
    content: string;
}[]): Promise<string>;
export declare function testAgent(agentId: string, tenantId: string, testMessage: string): Promise<string>;
export { MODEL_MAP };
