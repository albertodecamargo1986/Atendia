"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listVoiceProfiles = listVoiceProfiles;
exports.getVoiceProfile = getVoiceProfile;
exports.createVoiceProfile = createVoiceProfile;
exports.updateVoiceProfile = updateVoiceProfile;
exports.deleteVoiceProfile = deleteVoiceProfile;
exports.testVoiceProfile = testVoiceProfile;
exports.cloneVoiceFromAudio = cloneVoiceFromAudio;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const zod_1 = require("zod");
const errors_js_1 = require("../lib/errors.js");
const voice_service_js_1 = require("./voice.service.js");
const api_keys_service_js_1 = require("./api-keys.service.js");
const fs_1 = __importDefault(require("fs"));
const createVoiceProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    provider: zod_1.z.enum(['elevenlabs', 'openai']).default('elevenlabs'),
    voiceId: zod_1.z.string().min(1, 'Voice ID é obrigatório'),
    isDefault: zod_1.z.boolean().default(false),
    sampleUrl: zod_1.z.string().url().optional(),
});
const updateVoiceProfileSchema = createVoiceProfileSchema.partial();
async function listVoiceProfiles(tenantId) {
    return prisma_js_1.default.voiceProfile.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: {
            _count: { select: { agents: true } },
        },
    });
}
async function getVoiceProfile(tenantId, profileId) {
    const profile = await prisma_js_1.default.voiceProfile.findFirst({
        where: { id: profileId, tenantId },
        include: { agents: { select: { id: true, name: true } } },
    });
    if (!profile)
        throw new errors_js_1.NotFoundError('Perfil de voz', profileId);
    return profile;
}
async function createVoiceProfile(tenantId, data) {
    const parsed = createVoiceProfileSchema.parse(data);
    if (parsed.isDefault) {
        await prisma_js_1.default.voiceProfile.updateMany({
            where: { tenantId, isDefault: true },
            data: { isDefault: false },
        });
    }
    return prisma_js_1.default.voiceProfile.create({
        data: {
            tenantId,
            name: parsed.name,
            provider: parsed.provider,
            voiceId: parsed.voiceId,
            isDefault: parsed.isDefault,
            sampleUrl: parsed.sampleUrl,
        },
    });
}
async function updateVoiceProfile(tenantId, profileId, data) {
    const parsed = updateVoiceProfileSchema.parse(data);
    const existing = await prisma_js_1.default.voiceProfile.findFirst({
        where: { id: profileId, tenantId },
    });
    if (!existing)
        throw new errors_js_1.NotFoundError('Perfil de voz', profileId);
    if (parsed.isDefault) {
        await prisma_js_1.default.voiceProfile.updateMany({
            where: { tenantId, isDefault: true },
            data: { isDefault: false },
        });
    }
    return prisma_js_1.default.voiceProfile.update({
        where: { id: profileId },
        data: parsed,
    });
}
async function deleteVoiceProfile(tenantId, profileId) {
    const existing = await prisma_js_1.default.voiceProfile.findFirst({
        where: { id: profileId, tenantId },
    });
    if (!existing)
        throw new errors_js_1.NotFoundError('Perfil de voz', profileId);
    // Unlink from any agents
    await prisma_js_1.default.agent.updateMany({
        where: { voiceProfileId: profileId },
        data: { voiceProfileId: null },
    });
    return prisma_js_1.default.voiceProfile.delete({ where: { id: profileId } });
}
async function testVoiceProfile(tenantId, profileId) {
    const profile = await prisma_js_1.default.voiceProfile.findFirst({
        where: { id: profileId, tenantId },
    });
    if (!profile)
        throw new errors_js_1.NotFoundError('Perfil de voz', profileId);
    const sampleText = 'Olá! Eu sou o assistente virtual da AtendIA. Como posso ajudar você hoje?';
    const audioPath = await (0, voice_service_js_1.generateAudioResponse)(sampleText, profile.voiceId, tenantId, profile.provider);
    const fileName = audioPath.split('/').pop() || audioPath.split('\\').pop() || '';
    return `/uploads/audio/${fileName}`;
}
async function cloneVoiceFromAudio(tenantId, name, files) {
    const tenantKey = await (0, api_keys_service_js_1.getDecryptedKey)(tenantId, 'ELEVENLABS');
    const apiKey = tenantKey || process.env.ELEVENLABS_API_KEY;
    if (!apiKey)
        throw new errors_js_1.ValidationError('Nenhuma API Key ElevenLabs configurada. Adicione uma em Configurações > API Keys.');
    // Build multipart form data for ElevenLabs add_voice endpoint
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', `Voz clonada via AtendIA - ${new Date().toISOString()}`);
    for (const file of files) {
        const buffer = fs_1.default.readFileSync(file.path);
        const blob = new Blob([buffer], { type: file.mimetype || 'audio/wav' });
        formData.append('files', blob, file.originalname);
    }
    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: {
            'xi-api-key': apiKey,
        },
        body: formData,
    });
    if (!response.ok) {
        const errText = await response.text();
        // Clean up uploaded files
        for (const file of files) {
            try {
                fs_1.default.unlinkSync(file.path);
            }
            catch { }
        }
        throw new errors_js_1.AppError(`ElevenLabs clone error ${response.status}: ${errText}`, 'EXTERNAL_API_ERROR', 502);
    }
    const result = await response.json();
    // Clean up temp files
    for (const file of files) {
        try {
            fs_1.default.unlinkSync(file.path);
        }
        catch { }
    }
    // Create voice profile with the cloned voice ID
    const profile = await createVoiceProfile(tenantId, {
        name,
        provider: 'elevenlabs',
        voiceId: result.voice_id,
        isDefault: false,
    });
    return { voiceId: result.voice_id, profile };
}
//# sourceMappingURL=voice-profile.service.js.map