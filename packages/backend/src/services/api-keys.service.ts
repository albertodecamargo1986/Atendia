import prisma from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import crypto from 'crypto';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  throw new Error('SESSION_ENCRYPTION_KEY is required. Set it in your .env file.');
}
const ALGORITHM = 'aes-256-cbc';

// Derive key once at startup instead of per-call (scryptSync is ~100ms each)
// TECH DEBT: SALT is hardcoded rather than random per-tenant. Changing this would
// break decryption of all existing stored keys. To migrate: add a per-tenant salt
// column, re-encrypt on next save, and fall back to this global salt for legacy keys.
const SALT = 'atendia-api-keys-salt';
const derivedKey = crypto.scryptSync(ENCRYPTION_KEY, SALT, 32);

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function listApiKeys(tenantId: string) {
  const keys = await prisma.tenantApiKey.findMany({
    where: { tenantId },
    select: {
      id: true,
      provider: true,
      isValid: true,
      lastTestedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return keys;
}

export async function getDecryptedKey(tenantId: string, provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS'): Promise<string | null> {
  const record = await prisma.tenantApiKey.findUnique({
    where: { tenantId_provider: { tenantId, provider } },
  });
  if (!record) return null;
  try {
    return decrypt(record.keyEnc);
  } catch {
    return null;
  }
}

export async function saveApiKey(tenantId: string, provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS', key: string) {
  const keyEnc = encrypt(key);

  const result = await prisma.tenantApiKey.upsert({
    where: { tenantId_provider: { tenantId, provider } },
    update: { keyEnc, isValid: false, lastTestedAt: null },
    create: { tenantId, provider, keyEnc, isValid: false },
  });

  const testResult = await testApiKey(provider, key);

  await prisma.tenantApiKey.update({
    where: { id: result.id },
    data: { isValid: testResult.valid, lastTestedAt: new Date() },
  });

  return {
    id: result.id,
    provider,
    isValid: testResult.valid,
    lastTestedAt: new Date(),
  };
}

export async function deleteApiKey(tenantId: string, provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS') {
  await prisma.tenantApiKey.delete({
    where: { tenantId_provider: { tenantId, provider } },
  });
}

export async function testApiKey(provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS', key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    if (provider === 'OPENAI') {
      const openai = new OpenAI({ apiKey: key, timeout: 10000 });
      await openai.models.list();
      return { valid: true };
    } else if (provider === 'ELEVENLABS') {
      const res = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': key },
      });
        if (!res.ok) return { valid: false, error: `ElevenLabs API returned ${res.status}` };
      return { valid: true };
    } else {
      const anthropic = new Anthropic({ apiKey: key, timeout: 10000 });
      await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return { valid: true };
    }
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

export async function testExistingKey(tenantId: string, provider: 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS') {
  const record = await prisma.tenantApiKey.findUnique({
    where: { tenantId_provider: { tenantId, provider } },
  });
  if (!record) throw new NotFoundError('API Key', tenantId);

  const key = decrypt(record.keyEnc);
  const result = await testApiKey(provider, key);

  await prisma.tenantApiKey.update({
    where: { id: record.id },
    data: { isValid: result.valid, lastTestedAt: new Date() },
  });

  return result;
}
