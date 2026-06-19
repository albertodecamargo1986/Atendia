import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

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

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

  // Em desenvolvimento, loga no console
  console.log('\n========================================');
  console.log('🔐 RECUPERAÇÃO DE SENHA');
  console.log(`📧 Email: ${email}`);
  console.log(`🔑 Token: ${token}`);
  console.log(`🔗 Link: ${resetUrl}`);
  console.log(`⏰ Expira: ${expiresAt.toLocaleString('pt-BR')}`);
  console.log('========================================\n');

  return { message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.' };
}

export async function resetPassword(token: string, newPassword: string) {
  if (!newPassword || newPassword.length < 6) {
    throw new ValidationError('Senha deve ter no mínimo 6 caracteres');
  }

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
