"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestPasswordReset = requestPasswordReset;
exports.resetPassword = resetPassword;
exports.validateResetToken = validateResetToken;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
const email_js_1 = require("../lib/email.js");
async function requestPasswordReset(email) {
    const user = await prisma_js_1.default.user.findUnique({ where: { email } });
    // Always return success to avoid email enumeration
    if (!user) {
        return { message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.' };
    }
    // Invalidate old tokens
    await prisma_js_1.default.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    const token = crypto_1.default.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma_js_1.default.passwordResetToken.create({
        data: {
            userId: user.id,
            tenantId: user.tenantId,
            token,
            expiresAt,
        },
    });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    // Envia email (com fallback para console se SMTP não configurado)
    await (0, email_js_1.sendPasswordResetEmail)(email, resetUrl);
    return { message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.' };
}
async function resetPassword(token, newPassword) {
    if (!newPassword || newPassword.length < 6) {
        throw new errors_js_1.ValidationError('Senha deve ter no mínimo 6 caracteres');
    }
    const resetToken = await prisma_js_1.default.passwordResetToken.findUnique({ where: { token } });
    if (!resetToken) {
        throw new errors_js_1.ValidationError('Token de recuperação inválido');
    }
    if (resetToken.usedAt) {
        throw new errors_js_1.ValidationError('Token de recuperação já foi utilizado');
    }
    if (resetToken.expiresAt < new Date()) {
        throw new errors_js_1.ValidationError('Token de recuperação expirado');
    }
    const passwordHash = await bcryptjs_1.default.hash(newPassword, 12);
    await prisma_js_1.default.$transaction([
        prisma_js_1.default.user.update({
            where: { id: resetToken.userId },
            data: { passwordHash },
        }),
        prisma_js_1.default.passwordResetToken.update({
            where: { id: resetToken.id },
            data: { usedAt: new Date() },
        }),
    ]);
    return { message: 'Senha alterada com sucesso' };
}
async function validateResetToken(token) {
    const resetToken = await prisma_js_1.default.passwordResetToken.findUnique({ where: { token } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
        return { valid: false };
    }
    return { valid: true };
}
//# sourceMappingURL=password-reset.service.js.map