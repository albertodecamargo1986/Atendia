"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAgentSchema = exports.createAgentSchema = void 0;
const zod_1 = require("zod");
exports.createAgentSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    description: zod_1.z.string().optional(),
    model: zod_1.z.enum(['gpt-4o-mini', 'gpt-4o', 'claude-3-haiku', 'claude-3-sonnet'], {
        errorMap: () => ({ message: 'Modelo inválido' }),
    }),
    systemPrompt: zod_1.z.string().min(10, 'Prompt deve ter no mínimo 10 caracteres'),
    temperature: zod_1.z.number().min(0).max(2).default(0.7),
    toneOfVoice: zod_1.z.string().default('amigavel'),
    language: zod_1.z.string().default('pt-BR'),
    customPrompt: zod_1.z.string().optional(),
    responseDelayMinMs: zod_1.z.number().int().min(0).max(30000).default(1000),
    responseDelayMaxMs: zod_1.z.number().int().min(0).max(30000).default(4000),
    sendAudioFrequency: zod_1.z.number().int().min(0).max(20).default(3),
    voiceProfileId: zod_1.z.string().optional(),
});
exports.updateAgentSchema = exports.createAgentSchema.partial();
//# sourceMappingURL=agent.js.map