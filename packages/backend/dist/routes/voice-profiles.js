"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const feature_gate_js_1 = require("../middlewares/feature-gate.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const multer_1 = __importDefault(require("multer"));
const voice_profile_service_js_1 = require("../services/voice-profile.service.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, feature_gate_js_1.requireModule)('voiceProfiles'));
const upload = (0, multer_1.default)({
    dest: 'uploads/voice-samples/',
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4'];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(wav|mp3|ogg|webm|m4a)$/i)) {
            cb(null, true);
        }
        else {
            cb(new Error('Tipo de áudio não suportado. Use WAV, MP3, OGG, WEBM ou M4A.'));
        }
    },
});
router.get('/', (0, async_handler_js_1.asyncHandler)(async (_req, res) => {
    const tenantId = _req.tenantId;
    const profiles = await (0, voice_profile_service_js_1.listVoiceProfiles)(tenantId);
    res.json({ success: true, data: profiles });
}));
router.get('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const profile = await (0, voice_profile_service_js_1.getVoiceProfile)(tenantId, req.params.id);
    res.json({ success: true, data: profile });
}));
router.post('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const profile = await (0, voice_profile_service_js_1.createVoiceProfile)(tenantId, req.body);
    res.status(201).json({ success: true, data: profile });
}));
router.patch('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const profile = await (0, voice_profile_service_js_1.updateVoiceProfile)(tenantId, req.params.id, req.body);
    res.json({ success: true, data: profile });
}));
router.delete('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    await (0, voice_profile_service_js_1.deleteVoiceProfile)(tenantId, req.params.id);
    res.json({ success: true });
}));
router.post('/:id/test', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const audioUrl = await (0, voice_profile_service_js_1.testVoiceProfile)(tenantId, req.params.id);
    res.json({ success: true, audioUrl });
}));
// Clone voice from uploaded audio samples via ElevenLabs
router.post('/clone', upload.array('files', 5), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const files = req.files;
    const name = req.body.name;
    if (!files || files.length === 0) {
        return res.status(400).json({ success: false, error: 'Envie pelo menos 1 arquivo de áudio' });
    }
    if (!name) {
        return res.status(400).json({ success: false, error: 'Nome da voz é obrigatório' });
    }
    const result = await (0, voice_profile_service_js_1.cloneVoiceFromAudio)(tenantId, name, files);
    res.status(201).json({ success: true, data: result });
}));
exports.default = router;
//# sourceMappingURL=voice-profiles.js.map