"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTOTP = verifyTOTP;
exports.generateSecret = generateSecret;
exports.generateQRCodeUrl = generateQRCodeUrl;
exports.enable2FA = enable2FA;
exports.disable2FA = disable2FA;
exports.setup2FA = setup2FA;
exports.verify2FAToken = verify2FAToken;
const errors_js_1 = require("../lib/errors.js");
const crypto_1 = __importDefault(require("crypto"));
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const TOTP_DIGITS = 6;
const TOTP_STEP = 30; // seconds
function base32Encode(buf) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const byte of buf) {
        bits += byte.toString(2).padStart(8, '0');
    }
    let result = '';
    for (let i = 0; i + 5 <= bits.length; i += 5) {
        result += alphabet[parseInt(bits.slice(i, i + 5), 2)];
    }
    return result;
}
function base32Decode(str) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of str) {
        const val = alphabet.indexOf(char.toUpperCase());
        if (val === -1)
            continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return Buffer.from(bytes);
}
function generateHOTP(secret, counter) {
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto_1.default.createHmac('sha1', secret);
    hmac.update(counterBuf);
    const hash = hmac.digest();
    const offset = hash[hash.length - 1] & 0x0f;
    const binary = ((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff);
    const otp = binary % Math.pow(10, TOTP_DIGITS);
    return otp.toString().padStart(TOTP_DIGITS, '0');
}
function verifyTOTP(secret, token, window = 1) {
    const secretBuf = base32Decode(secret);
    const counter = Math.floor(Date.now() / 1000 / TOTP_STEP);
    for (let i = -window; i <= window; i++) {
        const candidate = generateHOTP(secretBuf, counter + i);
        const candidateBuf = Buffer.from(candidate);
        const tokenBuf = Buffer.from(token);
        if (candidateBuf.length !== tokenBuf.length)
            continue;
        if (crypto_1.default.timingSafeEqual(candidateBuf, tokenBuf)) {
            return true;
        }
    }
    return false;
}
function generateSecret() {
    return base32Encode(crypto_1.default.randomBytes(20));
}
function generateQRCodeUrl(email, secret) {
    const issuer = 'AtendIA';
    const account = encodeURIComponent(email);
    const encodedSecret = encodeURIComponent(secret);
    return `otpauth://totp/${issuer}:${account}?secret=${encodedSecret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;
}
async function enable2FA(userId, token) {
    const user = await prisma_js_1.default.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret)
        throw new errors_js_1.ValidationError('Configure o 2FA primeiro');
    if (!verifyTOTP(user.twoFactorSecret, token)) {
        throw new errors_js_1.UnauthorizedError('Código inválido');
    }
    await prisma_js_1.default.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
    });
    await prisma_js_1.default.auditLog.create({
        data: {
            tenantId: user.tenantId,
            userId,
            action: 'ENABLE_2FA',
            entity: 'User',
            entityId: userId,
        },
    });
    return true;
}
async function disable2FA(userId, token) {
    const user = await prisma_js_1.default.user.findUnique({ where: { id: userId } });
    if (!user)
        throw new errors_js_1.NotFoundError('Usuário', userId);
    if (!user.twoFactorSecret) {
        throw new errors_js_1.ValidationError('2FA não configurado para este usuário');
    }
    if (user.twoFactorEnabled && !verifyTOTP(user.twoFactorSecret, token)) {
        throw new errors_js_1.UnauthorizedError('Código inválido');
    }
    await prisma_js_1.default.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    await prisma_js_1.default.auditLog.create({
        data: {
            tenantId: user.tenantId,
            userId,
            action: 'DISABLE_2FA',
            entity: 'User',
            entityId: userId,
        },
    });
    return true;
}
async function setup2FA(userId) {
    const secret = generateSecret();
    const user = await prisma_js_1.default.user.findUnique({ where: { id: userId } });
    if (!user)
        throw new errors_js_1.NotFoundError('Usuário', userId);
    await prisma_js_1.default.user.update({
        where: { id: userId },
        data: { twoFactorSecret: secret },
    });
    const qrUrl = generateQRCodeUrl(user.email, secret);
    return { secret, qrUrl };
}
async function verify2FAToken(userId, token) {
    const user = await prisma_js_1.default.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret)
        return false;
    return verifyTOTP(user.twoFactorSecret, token);
}
//# sourceMappingURL=two-factor.service.js.map