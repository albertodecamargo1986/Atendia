import { ValidationError, AppError } from '../lib/errors.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';
import { getDecryptedKey } from './api-keys.service.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const AUDIO_DIR = path.join(UPLOAD_DIR, 'audio');

function ensureAudioDir() {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

async function getOpenAIClient(tenantId: string): Promise<OpenAI> {
  const tenantKey = await getDecryptedKey(tenantId, 'OPENAI');
  const apiKey = tenantKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ValidationError('Nenhuma API Key OpenAI configurada para transcrição/TTS.');
  return new OpenAI({ apiKey });
}

// ---------- Transcription (Whisper) ----------

export async function transcribeAudio(filePath: string, tenantId: string): Promise<string> {
  const openai = await getOpenAIClient(tenantId);

  const audioStream = fs.createReadStream(filePath);
  const transcription = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file: audioStream as any,
    language: 'pt',
  });

  return transcription.text || '';
}

// ---------- TTS — ElevenLabs (principal) + OpenAI TTS (fallback) ----------

export async function generateAudioResponse(
  text: string,
  voiceId: string,
  tenantId: string,
  provider: 'elevenlabs' | 'openai' = 'elevenlabs'
): Promise<string> {
  ensureAudioDir();

  if (provider === 'elevenlabs' && voiceId) {
    try {
      return await generateElevenLabsAudio(text, voiceId, tenantId);
    } catch (err: any) {
      console.warn(`ElevenLabs TTS failed, falling back to OpenAI TTS: ${err.message}`);
    }
  }

  return generateOpenAITTSAudio(text, voiceId || 'alloy', tenantId);
}

async function generateElevenLabsAudio(
  text: string,
  voiceId: string,
  tenantId: string
): Promise<string> {
  const tenantKey = await getDecryptedKey(tenantId, 'ELEVENLABS');
  const apiKey = tenantKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new ValidationError('Nenhuma API Key ElevenLabs configurada.');

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
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
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new AppError(`ElevenLabs API error ${response.status}: ${errBody}`, 'EXTERNAL_API_ERROR', 502);
  }

  const fileName = `${crypto.randomUUID()}.mp3`;
  const filePath = path.join(AUDIO_DIR, fileName);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

async function generateOpenAITTSAudio(
  text: string,
  voice: string,
  tenantId: string
): Promise<string> {
  const openai = await getOpenAIClient(tenantId);

  const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  const ttsVoice = validVoices.includes(voice) ? voice : 'alloy';

  const mp3 = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice: ttsVoice as any,
    input: text.substring(0, 4096),
  });

  const fileName = `${crypto.randomUUID()}.mp3`;
  const filePath = path.join(AUDIO_DIR, fileName);
  const buffer = Buffer.from(await mp3.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

// ---------- Download WhatsApp audio ----------

export async function downloadWhatsAppAudio(
  sock: any,
  msg: any
): Promise<{ filePath: string; fileName: string } | null> {
  try {
    ensureAudioDir();
    const buffer = await sock.downloadMediaMessage(msg);
    if (!buffer) return null;

    const fileName = `${crypto.randomUUID()}.ogg`;
    const filePath = path.join(AUDIO_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(buffer));

    return { filePath, fileName };
  } catch (err: any) {
    console.error('Failed to download WhatsApp audio:', err.message);
    return null;
  }
}
