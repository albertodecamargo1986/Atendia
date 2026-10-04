import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { ValidationError } from '../lib/errors.js';
import { sendPasswordResetEmail } from '../lib/email.js';
import { passwordSchema } from '../lib/password.js';
import { getPublicUrls } from '../config/index.js';

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Always return success to avoid email enumeration
  if (!user) {
    return { message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.' };
  }

  // Invalidate old tokens
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      token,
      expiresAt,
    },
  });

  const frontendUrl = getPublicUrls().FRONTEND_URL;
  const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

  // Envia email (com fallback para console se SMTP não configurado)
  await sendPasswordResetEmail(email, resetUrl);

  return { message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.' };
}

export async function resetPassword(token: string, newPassword: string) {
  // Mesma política de senha do cadastro (lança 422 se fraca)
  passwordSchema.parse(newPassword);

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken) {
    throw new ValidationError('Token de recuperação inválido');
  }

  if (resetToken.usedAt) {
    throw new ValidationError('Token de recuperação já foi utilizado');
  }

  if (resetToken.expiresAt < new Date()) {
    throw new ValidationError('Token de recuperação expirado');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
    // Encerra todas as sessões abertas com a senha antiga
    prisma.refreshToken.deleteMany({ where: { userId: resetToken.userId } }),
  ]);

  return { message: 'Senha alterada com sucesso' };
}

export async function validateResetToken(token: string) {
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { valid: false };
  }
  return { valid: true };
}
