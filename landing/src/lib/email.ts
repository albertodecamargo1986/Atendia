import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendWelcomeEmailParams {
  to: string;
  customerName: string;
  plan: string;
}

const planLabels: Record<string, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

export async function sendWelcomeEmail({
  to,
  customerName,
  plan,
}: SendWelcomeEmailParams): Promise<void> {
  const planLabel = planLabels[plan] || plan;
  const appUrl = "https://app.atend-ia.com";

  const { error } = await resend.emails.send({
    from: "AtendIA <equipe@atend-ia.com>",
    to,
    subject: `Bem-vindo ao AtendIA! Acesse seu painel`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#2563EB,#1E40AF);padding:40px 30px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">AtendIA</h1>
      <p style="color:#93C5FD;margin:8px 0 0;font-size:16px;">Atendimento Inteligente via WhatsApp</p>
    </td>
  </tr>
  <!-- Body -->
  <tr>
    <td style="padding:40px 30px;">
      <h2 style="color:#0F172A;margin:0 0 8px;font-size:22px;">Ola, ${customerName}!</h2>
      <p style="color:#475569;margin:0 0 24px;font-size:16px;line-height:1.6;">
        Sua assinatura <strong>${planLabel}</strong> foi confirmada com sucesso!
        Seu painel ja esta pronto para uso.
      </p>

      <!-- Plan Details -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;color:#475569;font-size:14px;width:50%;">Plano:</td>
          <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;color:#0F172A;font-size:14px;font-weight:600;width:50%;">${planLabel}</td>
        </tr>
      </table>

      <!-- Access Button -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:center;padding:8px 0;">
            <a href="${appUrl}" style="background:linear-gradient(135deg,#2563EB,#1E40AF);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:600;display:inline-block;">Acessar Painel</a>
          </td>
        </tr>
      </table>

      <!-- Instructions -->
      <h3 style="color:#0F172A;margin:24px 0 16px;font-size:18px;">Primeiros passos:</h3>
      <ol style="color:#475569;margin:0 0 24px;padding-left:20px;font-size:14px;line-height:2;">
        <li>Acesse <strong>${appUrl}</strong> e faça login com seu email</li>
        <li>Se preferir, crie uma senha no link "Esqueci minha senha" da tela de login</li>
        <li>No painel, configure seu agente de IA (tom de voz, regras e conhecimento)</li>
        <li>Conecte seu WhatsApp e comece a atender!</li>
      </ol>

      <!-- Support -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 0;">
        <tr>
          <td style="background:#FEF3C7;border-radius:8px;padding:16px 20px;">
            <p style="color:#92400E;margin:0;font-size:13px;line-height:1.5;">
              <strong>Precisa de ajuda?</strong> Entre em contato com nosso suporte:
              <a href="mailto:suporte@atend-ia.com" style="color:#2563EB;">suporte@atend-ia.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="background:#F8FAFC;padding:24px 30px;text-align:center;border-top:1px solid #E2E8F0;">
      <p style="color:#94A3B8;margin:0;font-size:12px;line-height:1.6;">
        AtendIA — Inteligencia Artificial para Atendimento<br>
        Este e-mail foi enviado porque voce adquiriu uma assinatura AtendIA.<br>
        Duvidas? Responda este e-mail ou acesse <a href="https://atend-ia.com" style="color:#2563EB;">atend-ia.com</a>
      </p>
    </td>
  </tr>
</table>
</body>
</html>`,
  });

  if (error) {
    console.error("Failed to send welcome email:", error);
    throw new Error("Failed to send email");
  }
}
