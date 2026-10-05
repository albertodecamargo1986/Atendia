-- =============================================================================
-- WhatsApp oficial (Cloud API) — correções da auditoria (IDEMPOTENTE, ADITIVA)
--   * Message.waMessageId (+ índice): status de entrega encontra a mensagem sem varrer metadata
--   * Backfill: conversas antigas sem número herdam o número do ticket (elegibilidade de campanha)
-- =============================================================================

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "waMessageId" TEXT;
CREATE INDEX IF NOT EXISTS "Message_waMessageId_idx" ON "Message"("waMessageId");

UPDATE "Conversation" c
   SET "whatsappSessionId" = t."whatsappSessionId"
  FROM "Ticket" t
 WHERE t."conversationId" = c.id
   AND c."whatsappSessionId" IS NULL
   AND t."whatsappSessionId" IS NOT NULL;
