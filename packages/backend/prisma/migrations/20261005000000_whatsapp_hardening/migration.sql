-- =============================================================================
-- WhatsApp — endurecimento após auditoria (IDEMPOTENTE)
--   * WhatsAppSession.restrictionIncidents  histórico de restrições (463/475) do número
--   * WhatsAppSession.campaignsDisabledAt   campanhas desligadas após 2 restrições em 30 dias
--   * WhatsAppSession.linkedAt              data do pareamento (base do aquecimento)
-- =============================================================================

ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "restrictionIncidents" JSONB;
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "campaignsDisabledAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "linkedAt" TIMESTAMP(3);

-- Sessões existentes: considera pareadas na criação (mesmo comportamento de antes)
UPDATE "WhatsAppSession" SET "linkedAt" = "createdAt" WHERE "linkedAt" IS NULL AND "phoneNumber" IS NOT NULL;
