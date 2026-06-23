"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateVoiceProfileSchema = exports.createVoiceProfileSchema = void 0;
const zod_1 = require("zod");
exports.createVoiceProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    provider: zod_1.z.enum(['elevenlabs', 'openai']).default('elevenlabs'),
    voiceId: zod_1.z.string().min(1, 'Voice ID é obrigatório'),
    isDefault: zod_1.z.boolean().default(false),
    sampleUrl: zod_1.z.string().url().optional(),
});
exports.updateVoiceProfileSchema = exports.createVoiceProfileSchema.partial();
//# sourceMappingURL=voice-profile.js.map