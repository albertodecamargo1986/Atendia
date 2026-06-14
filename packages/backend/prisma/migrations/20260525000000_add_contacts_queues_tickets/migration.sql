-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('PENDING', 'OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "contactId" TEXT;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "profilePicUrl" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "lid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Queue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "greetingMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQueue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    CONSTRAINT "UserQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappQueue" (
    "id" TEXT NOT NULL,
    "whatsappSessionId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    CONSTRAINT "WhatsappQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "queueId" TEXT,
    "whatsappSessionId" TEXT,
    "assignedTo" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'PENDING',
    "unreadMessages" INTEGER NOT NULL DEFAULT 0,
    "lastMessage" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- Data migration: extract unique contacts from existing Conversations
INSERT INTO "Contact" ("id", "tenantId", "name", "phone", "email", "isGroup", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    c."tenantId",
    COALESCE(c."contactName", c."contactPhone", 'Unknown'),
    COALESCE(c."contactPhone", 'unknown_' || c."id"),
    '',
    false,
    NOW(),
    NOW()
FROM "Conversation" c
WHERE c."contactPhone" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update Conversation.contactId to link to new Contact records
UPDATE "Conversation" c
SET "contactId" = ct."id"
FROM "Contact" ct
WHERE ct."tenantId" = c."tenantId"
  AND ct."phone" = c."contactPhone";

-- Create Tickets for existing Conversations
INSERT INTO "Ticket" ("id", "tenantId", "conversationId", "contactId", "status", "unreadMessages", "isGroup", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    c."tenantId",
    c."id",
    COALESCE(c."contactId", '00000000-0000-0000-0000-000000000000'),
    CASE
        WHEN c."status" = 'ACTIVE' THEN 'OPEN'
        WHEN c."status" = 'PENDING' THEN 'PENDING'
        WHEN c."status" IN ('RESOLVED', 'CLOSED') THEN 'CLOSED'
        WHEN c."status" = 'HUMAN_TAKEOVER' THEN 'OPEN'
        ELSE 'PENDING'
    END::"TicketStatus",
    0,
    false,
    c."createdAt",
    c."updatedAt"
FROM "Conversation" c
WHERE NOT EXISTS (
    SELECT 1 FROM "Ticket" t WHERE t."conversationId" = c."id"
);

-- CreateIndex
CREATE INDEX "Contact_tenantId_idx" ON "Contact"("tenantId");
CREATE INDEX "Contact_phone_idx" ON "Contact"("phone");
CREATE UNIQUE INDEX "Contact_tenantId_phone_key" ON "Contact"("tenantId", "phone");

CREATE INDEX "Queue_tenantId_idx" ON "Queue"("tenantId");
CREATE UNIQUE INDEX "Queue_tenantId_name_key" ON "Queue"("tenantId", "name");

CREATE UNIQUE INDEX "UserQueue_userId_queueId_key" ON "UserQueue"("userId", "queueId");
CREATE UNIQUE INDEX "WhatsappQueue_whatsappSessionId_queueId_key" ON "WhatsappQueue"("whatsappSessionId", "queueId");

CREATE UNIQUE INDEX "Ticket_conversationId_key" ON "Ticket"("conversationId");
CREATE INDEX "Ticket_tenantId_idx" ON "Ticket"("tenantId");
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "Ticket_queueId_idx" ON "Ticket"("queueId");
CREATE INDEX "Ticket_assignedTo_idx" ON "Ticket"("assignedTo");
CREATE INDEX "Ticket_contactId_idx" ON "Ticket"("contactId");
CREATE INDEX "Conversation_contactId_idx" ON "Conversation"("contactId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Queue" ADD CONSTRAINT "Queue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserQueue" ADD CONSTRAINT "UserQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserQueue" ADD CONSTRAINT "UserQueue_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsappQueue" ADD CONSTRAINT "WhatsappQueue_whatsappSessionId_fkey" FOREIGN KEY ("whatsappSessionId") REFERENCES "WhatsAppSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsappQueue" ADD CONSTRAINT "WhatsappQueue_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_whatsappSessionId_fkey" FOREIGN KEY ("whatsappSessionId") REFERENCES "WhatsAppSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
