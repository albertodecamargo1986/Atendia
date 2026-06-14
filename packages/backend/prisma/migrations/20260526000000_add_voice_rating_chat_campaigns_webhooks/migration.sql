-- Migration: add VoiceProfile fields to Agent
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "responseDelayMinMs" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "responseDelayMaxMs" INTEGER NOT NULL DEFAULT 4000;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "sendAudioFrequency" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "voiceProfileId" TEXT;

-- Migration: add extended fields to Contact
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "cpfCnpj" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "zipCode" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "company" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "role" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- CreateTable: VoiceProfile
CREATE TABLE IF NOT EXISTS "VoiceProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'elevenlabs',
    "voiceId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sampleUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VoiceProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VoiceProfile_tenantId_name_key" ON "VoiceProfile"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "VoiceProfile_tenantId_idx" ON "VoiceProfile"("tenantId");

ALTER TABLE "Agent" ADD CONSTRAINT "Agent_voiceProfileId_fkey" FOREIGN KEY ("voiceProfileId") REFERENCES "VoiceProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VoiceProfile" ADD CONSTRAINT "VoiceProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: TicketRating
CREATE TABLE IF NOT EXISTS "TicketRating" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TicketRating_ticketId_key" ON "TicketRating"("ticketId");
CREATE INDEX IF NOT EXISTS "TicketRating_ticketId_idx" ON "TicketRating"("ticketId");
CREATE INDEX IF NOT EXISTS "TicketRating_score_idx" ON "TicketRating"("score");

ALTER TABLE "TicketRating" ADD CONSTRAINT "TicketRating_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum for campaigns
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CampaignContactStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable: InternalMessage
CREATE TABLE IF NOT EXISTS "InternalMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT,
    "groupId" TEXT,
    "content" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InternalMessage_tenantId_idx" ON "InternalMessage"("tenantId");
CREATE INDEX IF NOT EXISTS "InternalMessage_senderId_idx" ON "InternalMessage"("senderId");
CREATE INDEX IF NOT EXISTS "InternalMessage_receiverId_idx" ON "InternalMessage"("receiverId");
CREATE INDEX IF NOT EXISTS "InternalMessage_groupId_idx" ON "InternalMessage"("groupId");
CREATE INDEX IF NOT EXISTS "InternalMessage_createdAt_idx" ON "InternalMessage"("createdAt");

ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Campaign
CREATE TABLE IF NOT EXISTS "Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Campaign_tenantId_idx" ON "Campaign"("tenantId");
CREATE INDEX IF NOT EXISTS "Campaign_status_idx" ON "Campaign"("status");

ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: CampaignContact
CREATE TABLE IF NOT EXISTS "CampaignContact" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "CampaignContactStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    CONSTRAINT "CampaignContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CampaignContact_campaignId_contactId_key" ON "CampaignContact"("campaignId", "contactId");
CREATE INDEX IF NOT EXISTS "CampaignContact_campaignId_idx" ON "CampaignContact"("campaignId");
CREATE INDEX IF NOT EXISTS "CampaignContact_status_idx" ON "CampaignContact"("status");

ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: Webhook
CREATE TABLE IF NOT EXISTS "Webhook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Webhook_tenantId_idx" ON "Webhook"("tenantId");

ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: WebhookDelivery
CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_success_idx" ON "WebhookDelivery"("success");

ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
