"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listApiKeys = listApiKeys;
exports.getDecryptedKey = getDecryptedKey;
exports.saveApiKey = saveApiKey;
exports.deleteApiKey = deleteApiKey;
exports.testApiKey = testApiKey;
exports.testExistingKey = testExistingKey;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
const crypto_1 = __importDefault(require("crypto"));
const openai_1 = __importDefault(require("openai"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
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
const derivedKey = crypto_1.default.scryptSync(ENCRYPTION_KEY, SALT, 32);
function encrypt(text) {
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, derivedKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}
function decrypt(encryptedText) {
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, derivedKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
async function listApiKeys(tenantId) {
    const keys = await prisma_js_1.default.tenantApiKey.findMany({
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
async function getDecryptedKey(tenantId, provider) {
    const record = await prisma_js_1.default.tenantApiKey.findUnique({
        where: { tenantId_provider: { tenantId, provider } },
    });
    if (!record)
        return null;
    try {
        return decrypt(record.keyEnc);
    }
    catch {
        return null;
    }
}
async function saveApiKey(tenantId, provider, key) {
    const keyEnc = encrypt(key);
    const result = await prisma_js_1.default.tenantApiKey.upsert({
        where: { tenantId_provider: { tenantId, provider } },
        update: { keyEnc, isValid: false, lastTestedAt: null },
        create: { tenantId, provider, keyEnc, isValid: false },
    });
    const testResult = await testApiKey(provider, key);
    await prisma_js_1.default.tenantApiKey.update({
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
async function deleteApiKey(tenantId, provider) {
    await prisma_js_1.default.tenantApiKey.delete({
        where: { tenantId_provider: { tenantId, provider } },
    });
}
async function testApiKey(provider, key) {
    try {
        if (provider === 'OPENAI') {
            const openai = new openai_1.default({ apiKey: key, timeout: 10000 });
            await openai.models.list();
            return { valid: true };
        }
        else if (provider === 'ELEVENLABS') {
            const res = await fetch('https://api.elevenlabs.io/v1/user', {
                headers: { 'xi-api-key': key },
            });
            if (!res.ok)
                return { valid: false, error: `ElevenLabs API returned ${res.status}` };
            return { valid: true };
        }
        else {
            const anthropic = new sdk_1.default({ apiKey: key, timeout: 10000 });
            await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 5,
                messages: [{ role: 'user', content: 'Hi' }],
            });
            return { valid: true };
        }
    }
    catch (err) {
        return { valid: false, error: err.message };
    }
}
async function testExistingKey(tenantId, provider) {
    const record = await prisma_js_1.default.tenantApiKey.findUnique({
        where: { tenantId_provider: { tenantId, provider } },
    });
    if (!record)
        throw new errors_js_1.NotFoundError('API Key', tenantId);
    const key = decrypt(record.keyEnc);
    const result = await testApiKey(provider, key);
    await prisma_js_1.default.tenantApiKey.update({
        where: { id: record.id },
        data: { isValid: result.valid, lastTestedAt: new Date() },
    });
    return result;
}
//# sourceMappingURL=api-keys.service.js.map