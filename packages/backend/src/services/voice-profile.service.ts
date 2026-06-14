import prisma from '../lib/prisma.js';
import { z } from 'zod';
import { NotFoundError, ValidationError, AppError } from '../lib/errors.js';
import { generateAudioResponse } from './voice.service.js';
import { getDecryptedKey } from './api-keys.service.js';
import fs from 'fs';
import path from 'path';

const createVoiceProfileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  provider: z.enum(['elevenlabs', 'openai']).default('elevenlabs'),
  voiceId: z.string().min(1, 'Voice ID é obrigatório'),
  isDefault: z.boolean().default(false),
  sampleUrl: z.string().url().optional(),
});

const updateVoiceProfileSchema = createVoiceProfileSchema.partial();

export async function listVoiceProfiles(tenantId: string) {
  return prisma.voiceProfile.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { agents: true } },
    },
  });
}

export async function getVoiceProfile(tenantId: string, profileId: string) {
  const profile = await prisma.voiceProfile.findFirst({
    where: { id: profileId, tenantId },
    include: { agents: { select: { id: true, name: true } } },
  });
  if (!profile) throw new NotFoundError('Perfil de voz', profileId);
  return profile;
}

export async function createVoiceProfile(tenantId: string, data: z.infer<typeof createVoiceProfileSchema>) {
  const parsed = createVoiceProfileSchema.parse(data);

  if (parsed.isDefault) {
    await prisma.voiceProfile.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }

  return prisma.voiceProfile.create({
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

export async function updateVoiceProfile(tenantId: string, profileId: string, data: z.infer<typeof updateVoiceProfileSchema>) {
  const parsed = updateVoiceProfileSchema.parse(data);

  const existing = await prisma.voiceProfile.findFirst({
    where: { id: profileId, tenantId },
  });
  if (!existing) throw new NotFoundError('Perfil de voz', profileId);

  if (parsed.isDefault) {
    await prisma.voiceProfile.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }

  return prisma.voiceProfile.update({
    where: { id: profileId },
    data: parsed,
  });
}

export async function deleteVoiceProfile(tenantId: string, profileId: string) {
  const existing = await prisma.voiceProfile.findFirst({
    where: { id: profileId, tenantId },
  });
  if (!existing) throw new NotFoundError('Perfil de voz', profileId);

  // Unlink from any agents
  await prisma.agent.updateMany({
    where: { voiceProfileId: profileId },
    data: { voiceProfileId: null },
  });

  return prisma.voiceProfile.delete({ where: { id: profileId } });
}

export async function testVoiceProfile(tenantId: string, profileId: string): Promise<string> {
  const profile = await prisma.voiceProfile.findFirst({
    where: { id: profileId, tenantId },
  });
  if (!profile) throw new NotFoundError('Perfil de voz', profileId);

  const sampleText = 'Olá! Eu sou o assistente virtual da AtendIA. Como posso ajudar você hoje?';
  const audioPath = await generateAudioResponse(
    sampleText,
    profile.voiceId,
    tenantId,
    profile.provider as 'elevenlabs' | 'openai'
  );

  const fileName = audioPath.split('/').pop() || audioPath.split('\\').pop() || '';
  return `/uploads/audio/${fileName}`;
}

export async function cloneVoiceFromAudio(
  tenantId: string,
  name: string,
  files: Express.Multer.File[]
): Promise<{ voiceId: string; profile: any }> {
  const tenantKey = await getDecryptedKey(tenantId, 'ELEVENLABS');
  const apiKey = tenantKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new ValidationError('Nenhuma API Key ElevenLabs configurada. Adicione uma em Configurações > API Keys.');

  // Build multipart form data for ElevenLabs add_voice endpoint
  const formData = new FormData();
  formData.append('name', name);
  formData.append('description', `Voz clonada via AtendIA - ${new Date().toISOString()}`);

  for (const file of files) {
    const buffer = fs.readFileSync(file.path);
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
      try { fs.unlinkSync(file.path); } catch {}
    }
    throw new AppError(`ElevenLabs clone error ${response.status}: ${errText}`, 'EXTERNAL_API_ERROR', 502);
  }

  const result = await response.json() as { voice_id: string };

  // Clean up temp files
  for (const file of files) {
    try { fs.unlinkSync(file.path); } catch {}
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
