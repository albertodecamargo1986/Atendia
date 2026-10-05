-- =============================================================================
-- WhatsApp — conexão oficial da Meta (Cloud API) como 2ª opção (IDEMPOTENTE, ADITIVA)
--   * enum WhatsappProvider (BAILEYS | CLOUD_API)
--   * WhatsAppSession.provider            tipo de conexão (padrão BAILEYS: nada muda nas existentes)
--   * WhatsAppSession.cloudPhoneNumberId  Phone Number ID da Meta (único)
--   * WhatsAppSession.cloudConfig         credenciais cifradas + qualidade/tier
--   * Conversation.lastCustomerMessageAt  janela de 24 h da API oficial
--   * Campaign.templateName/templateLanguage/templateParams  campanha por modelo aprovado
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE "WhatsappProvider" AS ENUM ('BAILEYS', 'CLOUD_API');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "provider" "WhatsappProvider" NOT NULL DEFAULT 'BAILEYS';
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "cloudPhoneNumberId" TEXT;
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "cloudConfig" JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppSession_cloudPhoneNumberId_key" ON "WhatsAppSession"("cloudPhoneNumberId");

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastCustomerMessageAt" TIMESTAMP(3);

ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "templateName" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "templateLanguage" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "templateParams" JSONB;
