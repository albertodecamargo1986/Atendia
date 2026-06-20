import nodemailer from 'nodemailer';
import { getConfig } from '../config/index.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;

  const config = getConfig();
  if (!config.SMTP_HOST) {
    logger.warn('SMTP not configured — emails will be logged to console only');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });

  return _transporter;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const config = getConfig();
  const transporter = getTransporter();

  if (!transporter) {
    // Dev fallback — log to console
    logger.info({
      msg: '📧 EMAIL (console fallback)',
      to: params.to,
      subject: params.subject,
      body: params.text,
    });
    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL');
    console.log(`To: ${params.to}`);
    console.log(`Subject: ${params.subject}`);
    console.log('-'.repeat(60));
    console.log(params.text);
    console.log('='.repeat(60) + '\n');
    return;
  }

  try {
    await transporter.sendMail({
      from: config.EMAIL_FROM || 'AtendIA <noreply@atend-ia.com>',
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html || params.text.replace(/\n/g, '<br>'),
    });
    logger.info({ to: params.to, subject: params.subject }, 'Email sent');
  } catch (err: any) {
    logger.error({ err: err.message, to: params.to, subject: params.subject }, 'Failed to send email');
    // Don't throw — email failure shouldn't break the flow
  }
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Recuperação de Senha — AtendIA',
    text: [
      'Olá!',
      '',
      'Recebemos uma solicitação de recuperação de senha para sua conta no AtendIA.',
      '',
      `Para redefinir sua senha, clique no link abaixo (válido por 1 hora):`,
      '',
      resetUrl,
      '',
      'Se você não solicitou esta recuperação, ignore este email.',
      '',
      'Atenciosamente,',
      'Equipe AtendIA',
    ].join('\n'),
    html: [
      '<div style="max-width:560px;margin:40px auto;font-family:sans-serif;">',
      '<div style="text-align:center;margin-bottom:32px;">',
      '<div style="width:56px;height:56px;background:#7c3aed;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;color:white;font-size:24px;font-weight:bold;">A</div>',
      '</div>',
      '<h2 style="color:#1a1a2e;margin-bottom:16px;">Recuperação de Senha</h2>',
      '<p style="color:#64748b;line-height:1.6;">Olá! Recebemos uma solicitação de recuperação de senha para sua conta no <strong>AtendIA</strong>.</p>',
      '<div style="text-align:center;margin:32px 0;">',
      `<a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:#7c3aed;color:white;text-decoration:none;border-radius:12px;font-weight:600;">Redefinir Senha</a>`,
      '</div>',
      '<p style="color:#94a3b8;font-size:13px;line-height:1.4;">Este link expira em <strong>1 hora</strong>. Se você não solicitou esta recuperação, ignore este email.</p>',
      '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">',
      '<p style="color:#94a3b8;font-size:12px;">Equipe AtendIA — Multi-atendimento inteligente</p>',
      '</div>',
    ].join('\n'),
  });
}

export async function sendWelcomeEmail(email: string, name: string, tenantName: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Bem-vindo ao AtendIA!',
    text: [
      `Olá ${name},`,
      '',
      `Seja bem-vindo ao AtendIA! Sua empresa "${tenantName}" foi cadastrada com sucesso.`,
      '',
      'Agora você pode:',
      '- Conectar seu WhatsApp',
      '- Criar agentes de IA',
      '- Gerenciar atendimentos',
      '- Configurar horários e filas',
      '',
      'Qualquer dúvida, estamos à disposição.',
      '',
      'Atenciosamente,',
      'Equipe AtendIA',
    ].join('\n'),
    html: [
      '<div style="max-width:560px;margin:40px auto;font-family:sans-serif;">',
      `<h2 style="color:#1a1a2e;">Olá ${name},</h2>`,
      `<p style="color:#64748b;line-height:1.6;">Seja bem-vindo ao <strong>AtendIA</strong>! Sua empresa <strong>${tenantName}</strong> foi cadastrada com sucesso.</p>`,
      '<p style="color:#64748b;line-height:1.6;">Agora você pode:</p>',
      '<ul style="color:#64748b;line-height:1.8;">',
      '<li>Conectar seu WhatsApp</li>',
      '<li>Criar agentes de IA</li>',
      '<li>Gerenciar atendimentos</li>',
      '<li>Configurar horários e filas</li>',
      '</ul>',
      '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">',
      '<p style="color:#94a3b8;font-size:12px;">Equipe AtendIA — Multi-atendimento inteligente</p>',
      '</div>',
    ].join('\n'),
  });
}
