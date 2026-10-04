import { ValidationError, AppError } from '../lib/errors.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';
import P from 'pino';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getDecryptedKey } from './api-keys.service.js';

import { tenantUploadDir } from '../lib/uploads.js';
import { getUploadRoot } from '../config/index.js';

/** Pasta de áudios do tenant: UPLOAD_DIR/<tenantId>/audio (criada se não existir). */
function audioDir(tenantId: string): string {
  return tenantUploadDir(tenantId, 'audio');
}

/** Limite de mídia recebida baixada do WhatsApp. */
export const MAX_INCOMING_MEDIA_BYTES = 16 * 1024 * 1024;
/** Texto máximo para virar mensagem de voz (acima disso a resposta vai em texto). */
export const MAX_TTS_CHARS = 600;

const mediaLogger = P({ level: 'silent' });

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

export type TtsFormat = 'mp3' | 'opus';

/** OGG começa com "OggS". */
function isOggBuffer(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer.subarray(0, 4).toString('latin1') === 'OggS';
}

function saveAudio(tenantId: string, buffer: Buffer, ext: 'mp3' | 'ogg'): string {
  const filePath = path.join(audioDir(tenantId), `${crypto.randomUUID()}.${ext}`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Gera o áudio da resposta. Com format 'opus' devolve .ogg (OGG/Opus → mensagem de voz/PTT);
 * se o provedor não entregar OGG, devolve .mp3 (vai como áudio comum, sem PTT).
 */
export async function generateAudioResponse(
  text: string,
  voiceId: string,
  tenantId: string,
  provider: 'elevenlabs' | 'openai' = 'elevenlabs',
  format: TtsFormat = 'mp3',
): Promise<string> {
  if (provider === 'elevenlabs' && voiceId) {
    try {
      return await generateElevenLabsAudio(text, voiceId, tenantId, format);
    } catch (err: any) {
      console.warn(`ElevenLabs TTS failed, falling back to OpenAI TTS: ${err.message}`);
    }
  }

  return generateOpenAITTSAudio(text, voiceId || 'alloy', tenantId, format);
}

async function requestElevenLabs(apiKey: string, voiceId: string, text: string, outputFormat?: string) {
  const qs = outputFormat ? `?output_format=${encodeURIComponent(outputFormat)}` : '';
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}${qs}`, {
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
    signal: AbortSignal.timeout(60_000),
  });
}

async function generateElevenLabsAudio(
  text: string,
  voiceId: string,
  tenantId: string,
  format: TtsFormat,
): Promise<string> {
  const tenantKey = await getDecryptedKey(tenantId, 'ELEVENLABS');
  const apiKey = tenantKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new ValidationError('Nenhuma API Key ElevenLabs configurada.');

  if (format === 'opus') {
    // Opus em OGG (se o plano/conta suportar); senão cai para MP3 abaixo
    const res = await requestElevenLabs(apiKey, voiceId, text, 'opus_48000_64');
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (isOggBuffer(buffer)) return saveAudio(tenantId, buffer, 'ogg');
    }
  }

  const response = await requestElevenLabs(apiKey, voiceId, text);
  if (!response.ok) {
    const errBody = await response.text();
    throw new AppError(`ElevenLabs API error ${response.status}: ${errBody}`, 'EXTERNAL_API_ERROR', 502);
  }
  return saveAudio(tenantId, Buffer.from(await response.arrayBuffer()), 'mp3');
}

async function generateOpenAITTSAudio(
  text: string,
  voice: string,
  tenantId: string,
  format: TtsFormat,
): Promise<string> {
  const openai = await getOpenAIClient(tenantId);

  const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  const ttsVoice = validVoices.includes(voice) ? voice : 'alloy';

  const audio = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice: ttsVoice as any,
    input: text.substring(0, 4096),
    response_format: format === 'opus' ? 'opus' : 'mp3',
  });

  const buffer = Buffer.from(await audio.arrayBuffer());
  if (format === 'opus' && isOggBuffer(buffer)) return saveAudio(tenantId, buffer, 'ogg');
  return saveAudio(tenantId, buffer, 'mp3');
}

// ---------- Download de mídia recebida no WhatsApp ----------

/** Extensões seguras para servir de /uploads (nada de .html/.svg vindo de terceiros). */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'video/quicktime': 'mov',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/zip': 'zip',
};
const SAFE_EXTS = new Set(Object.values(MIME_EXT));

export function mediaExtension(mimetype?: string, fileName?: string, kind?: string): string {
  const base = (mimetype || '').split(';')[0].trim().toLowerCase();
  if (MIME_EXT[base]) return MIME_EXT[base];
  const fromName = path.extname(fileName || '').replace('.', '').toLowerCase();
  if (SAFE_EXTS.has(fromName)) return fromName;
  if (kind === 'AUDIO') return 'ogg';
  if (kind === 'IMAGE') return 'jpg';
  if (kind === 'VIDEO') return 'mp4';
  return 'bin';
}

/**
 * Baixa a mídia de uma mensagem recebida (downloadMediaMessage do Baileys, com reupload
 * quando a mídia expirou) e salva em uploads do tenant: áudio em /audio, o resto em /media.
 * Limite: 16 MB.
 */
export async function downloadWhatsAppMedia(
  sock: any,
  msg: any,
  tenantId: string,
  info: { kind: string; mimetype?: string; fileName?: string; fileLength?: number },
): Promise<{ filePath: string; fileName: string } | null> {
  try {
    if (info.fileLength && info.fileLength > MAX_INCOMING_MEDIA_BYTES) return null;
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
      logger: mediaLogger as any,
      reuploadRequest: sock.updateMediaMessage,
    });
    if (!buffer || buffer.length === 0 || buffer.length > MAX_INCOMING_MEDIA_BYTES) return null;

    const dir = info.kind === 'AUDIO' ? audioDir(tenantId) : tenantUploadDir(tenantId, 'media');
    const fileName = `${crypto.randomUUID()}.${mediaExtension(info.mimetype, info.fileName, info.kind)}`;
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { filePath, fileName };
  } catch (err: any) {
    console.error('Failed to download WhatsApp media:', err.message);
    return null;
  }
}

/** Remove arquivos de áudio (TTS e recebidos) com mais de `maxAgeDays` dias. */
export async function cleanupOldAudioFiles(maxAgeDays = 30, now: number = Date.now()): Promise<number> {
  const root = getUploadRoot();
  const limit = now - maxAgeDays * 86_400_000;
  let removed = 0;
  let tenants: string[] = [];
  try {
    tenants = await fs.promises.readdir(root);
  } catch {
    return 0;
  }
  for (const tenant of tenants) {
    const dir = path.join(root, tenant, 'audio');
    let files: string[] = [];
    try {
      files = await fs.promises.readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const full = path.join(dir, file);
      try {
        const stat = await fs.promises.stat(full);
        if (stat.isFile() && stat.mtimeMs < limit) {
          await fs.promises.unlink(full);
          removed++;
        }
      } catch { /* arquivo sumiu: ignora */ }
    }
  }
  return removed;
}
