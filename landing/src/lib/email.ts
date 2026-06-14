import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendSerialEmailParams {
  to: string;
  customerName: string;
  serial: string;
  plan: string;
  expiresAt: string;
}

const planLabels: Record<string, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

export async function sendSerialEmail({
  to,
  customerName,
  serial,
  plan,
  expiresAt,
}: SendSerialEmailParams): Promise<void> {
  const planLabel = planLabels[plan] || plan;
  const expiryDate = new Date(expiresAt).toLocaleDateString("pt-BR");
  const downloadUrl = process.env.NEXT_PUBLIC_DOWNLOAD_URL || "https://atend-ia.com/desktop/download";

  const { error } = await resend.emails.send({
    from: "AtendIA <licencas@atend-ia.com>",
    to,
    subject: `Sua Licenca AtendIA ${planLabel} - Serial de Ativacao`,
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
        Obrigado por adquirir o AtendIA Desktop! Sua licenca <strong>${planLabel}</strong> foi ativada com sucesso.
      </p>

      <!-- Serial Box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="background:#F1F5F9;border:2px dashed #2563EB;border-radius:8px;padding:24px;text-align:center;">
            <p style="color:#64748B;margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Seu Serial de Ativacao</p>
            <p style="color:#2563EB;margin:0;font-size:28px;font-weight:700;font-family:'Courier New',monospace;letter-spacing:2px;">${serial}</p>
          </td>
        </tr>
      </table>

      <!-- License Details -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;color:#475569;font-size:14px;width:50%;">Plano:</td>
          <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;color:#0F172A;font-size:14px;font-weight:600;width:50%;">${planLabel}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;color:#475569;font-size:14px;">Valido ate:</td>
          <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;color:#0F172A;font-size:14px;font-weight:600;">${expiryDate}</td>
        </tr>
      </table>

      <!-- Instructions -->
      <h3 style="color:#0F172A;margin:0 0 16px;font-size:18px;">Como Ativar</h3>
      <ol style="color:#475569;margin:0 0 24px;padding-left:20px;font-size:14px;line-height:2;">
        <li>Baixe o instalador clicando no botao abaixo</li>
        <li>Execute o arquivo <strong>AtendIA-Setup.exe</strong></li>
        <li>Na tela de ativacao, cole o serial acima</li>
        <li>Clique em <strong>"Ativar Licenca"</strong></li>
        <li>Pronto! Comece a usar o AtendIA</li>
      </ol>

      <!-- Download Button -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:center;padding:8px 0;">
            <a href="${downloadUrl}" style="background:linear-gradient(135deg,#2563EB,#1E40AF);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:600;display:inline-block;">Baixar Instalador</a>
          </td>
        </tr>
      </table>

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
        Este e-mail foi enviado porque voce adquiriu uma licenca AtendIA.<br>
        Duvidas? Responda este e-mail ou acesse <a href="https://atend-ia.com" style="color:#2563EB;">atend-ia.com</a>
      </p>
    </td>
  </tr>
</table>
</body>
</html>`,
  });

  if (error) {
    console.error("Failed to send serial email:", error);
    throw new Error("Failed to send email");
  }
}
