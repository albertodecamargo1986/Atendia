"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeAudio = transcribeAudio;
exports.generateAudioResponse = generateAudioResponse;
exports.downloadWhatsAppAudio = downloadWhatsAppAudio;
const errors_js_1 = require("../lib/errors.js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const openai_1 = __importDefault(require("openai"));
const api_keys_service_js_1 = require("./api-keys.service.js");
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const AUDIO_DIR = path_1.default.join(UPLOAD_DIR, 'audio');
function ensureAudioDir() {
    if (!fs_1.default.existsSync(AUDIO_DIR)) {
        fs_1.default.mkdirSync(AUDIO_DIR, { recursive: true });
    }
}
async function getOpenAIClient(tenantId) {
    const tenantKey = await (0, api_keys_service_js_1.getDecryptedKey)(tenantId, 'OPENAI');
    const apiKey = tenantKey || process.env.OPENAI_API_KEY;
    if (!apiKey)
        throw new errors_js_1.ValidationError('Nenhuma API Key OpenAI configurada para transcrição/TTS.');
    return new openai_1.default({ apiKey });
}
// ---------- Transcription (Whisper) ----------
async function transcribeAudio(filePath, tenantId) {
    const openai = await getOpenAIClient(tenantId);
    const audioStream = fs_1.default.createReadStream(filePath);
    const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file: audioStream,
        language: 'pt',
    });
    return transcription.text || '';
}
// ---------- TTS — ElevenLabs (principal) + OpenAI TTS (fallback) ----------
async function generateAudioResponse(text, voiceId, tenantId, provider = 'elevenlabs') {
    ensureAudioDir();
    if (provider === 'elevenlabs' && voiceId) {
        try {
            return await generateElevenLabsAudio(text, voiceId, tenantId);
        }
        catch (err) {
            console.warn(`ElevenLabs TTS failed, falling back to OpenAI TTS: ${err.message}`);
        }
    }
    return generateOpenAITTSAudio(text, voiceId || 'alloy', tenantId);
}
async function generateElevenLabsAudio(text, voiceId, tenantId) {
    const tenantKey = await (0, api_keys_service_js_1.getDecryptedKey)(tenantId, 'ELEVENLABS');
    const apiKey = tenantKey || process.env.ELEVENLABS_API_KEY;
    if (!apiKey)
        throw new errors_js_1.ValidationError('Nenhuma API Key ElevenLabs configurada.');
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
        },
        body: JSON.stringify({
            text: text.substring(0, 5000),
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true,
            },
        }),
    });
    if (!response.ok) {
        const errBody = await response.text();
        throw new errors_js_1.AppError(`ElevenLabs API error ${response.status}: ${errBody}`, 'EXTERNAL_API_ERROR', 502);
    }
    const fileName = `${crypto_1.default.randomUUID()}.mp3`;
    const filePath = path_1.default.join(AUDIO_DIR, fileName);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs_1.default.writeFileSync(filePath, buffer);
    return filePath;
}
async function generateOpenAITTSAudio(text, voice, tenantId) {
    const openai = await getOpenAIClient(tenantId);
    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    const ttsVoice = validVoices.includes(voice) ? voice : 'alloy';
    const mp3 = await openai.audio.speech.create({
        model: 'tts-1-hd',
        voice: ttsVoice,
        input: text.substring(0, 4096),
    });
    const fileName = `${crypto_1.default.randomUUID()}.mp3`;
    const filePath = path_1.default.join(AUDIO_DIR, fileName);
    const buffer = Buffer.from(await mp3.arrayBuffer());
    fs_1.default.writeFileSync(filePath, buffer);
    return filePath;
}
// ---------- Download WhatsApp audio ----------
async function downloadWhatsAppAudio(sock, msg) {
    try {
        ensureAudioDir();
        const buffer = await sock.downloadMediaMessage(msg);
        if (!buffer)
            return null;
        const fileName = `${crypto_1.default.randomUUID()}.ogg`;
        const filePath = path_1.default.join(AUDIO_DIR, fileName);
        fs_1.default.writeFileSync(filePath, Buffer.from(buffer));
        return { filePath, fileName };
    }
    catch (err) {
        console.error('Failed to download WhatsApp audio:', err.message);
        return null;
    }
}
//# sourceMappingURL=voice.service.js.map