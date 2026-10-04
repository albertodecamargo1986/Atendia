-- =============================================================================
-- WhatsApp — proteção do número (anti-banimento) + fluxo de atendimento
--
-- IDEMPOTENTE: pode rodar de novo (ou num banco onde parte já exista) sem erro.
--   * Contact.optedOutAt ............ opt-out (SAIR/PARAR/STOP...) — campanhas pulam
--   * Campaign.whatsappSessionId .... número que envia a campanha (FK, SET NULL)
--   * CampaignStatus.PAUSED ......... pausar campanha em execução
--   * Conversation.whatsappSessionId  conversa = contato + número (FK, SET NULL)
--   * WhatsAppSession.restrictedUntil  restrição temporária (463/475): automações pausadas
--   * Índices para contexto da IA e busca de conversa por telefone
--   * Dados: conversas PENDING (antigo "fora do horário") voltam para ACTIVE
-- =============================================================================

-- ─── Enum: CampaignStatus.PAUSED ─────────────────────────────────────────────
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'PAUSED' BEFORE 'COMPLETED';

-- ─── Contact.optedOutAt ──────────────────────────────────────────────────────
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "optedOutAt" TIMESTAMP(3);

-- ─── Campaign.whatsappSessionId ──────────────────────────────────────────────
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "whatsappSessionId" TEXT;
CREATE INDEX IF NOT EXISTS "Campaign_whatsappSessionId_idx" ON "Campaign"("whatsappSessionId");
DO $$ BEGIN
  ALTER TABLE "Campaign"
    ADD CONSTRAINT "Campaign_whatsappSessionId_fkey"
    FOREIGN KEY ("whatsappSessionId") REFERENCES "WhatsAppSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Conversation.whatsappSessionId ──────────────────────────────────────────
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "whatsappSessionId" TEXT;
CREATE INDEX IF NOT EXISTS "Conversation_whatsappSessionId_idx" ON "Conversation"("whatsappSessionId");
CREATE INDEX IF NOT EXISTS "Conversation_tenantId_contactPhone_idx" ON "Conversation"("tenantId", "contactPhone");
DO $$ BEGIN
  ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_whatsappSessionId_fkey"
    FOREIGN KEY ("whatsappSessionId") REFERENCES "WhatsAppSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── WhatsAppSession.restrictedUntil ─────────────────────────────────────────
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "restrictedUntil" TIMESTAMP(3);

-- ─── Message: índice para "últimas N mensagens da conversa" ──────────────────
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- ─── Dados: PENDING não é mais usado como "fora do horário" ──────────────────
-- (o status travava a IA depois do horário comercial; agora só o horário é checado)
UPDATE "Conversation" SET "status" = 'ACTIVE' WHERE "status" = 'PENDING';
