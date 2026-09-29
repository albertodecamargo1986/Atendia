-- =============================================================================
-- Baseline SaaS (Fases 1–3)
--
-- Deixa um banco NOVO idêntico ao schema.prisma após `prisma migrate deploy` e é
-- IDEMPOTENTE num banco antigo (VPS) que já tenha parte destas tabelas/colunas,
-- inclusive as criadas manualmente por scripts antigos (vps-fix-db.sh /
-- hotfix-vps.sql), que usavam TEXT no lugar de enums.
--
-- Recria o que a migration de licensing apagada no commit f0fde79 criava
-- (AppConfig, QuickReply, Tag, TicketTag, TenantApiKey, Customer, Payment,
-- PasswordResetToken, Permission) e adiciona:
--   * Role.SUPER_ADMIN
--   * WhatsAppSession.phoneNumber opcional (NULL em vez de '')
--   * WhatsAppSession.qrCode e WhatsAppSession.agentId (FK Agent, SET NULL)
--   * Tenant.onboardingCompletedAt
--   * Message.mediaUrl / Message.mediaType
-- =============================================================================

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ApiKeyProvider" AS ENUM ('OPENAI', 'ANTHROPIC', 'ELEVENLABS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentGateway" AS ENUM ('MERCADOPAGO', 'STRIPE', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Novo papel: dono da plataforma (só criado pelo script create-admin)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN' BEFORE 'OWNER';

-- ─── Tabelas antigas com nome minúsculo (scripts manuais da VPS) ─────────────
DO $$ BEGIN
  IF to_regclass('public.quickreply') IS NOT NULL AND to_regclass('public."QuickReply"') IS NULL THEN
    ALTER TABLE public.quickreply RENAME TO "QuickReply";
  END IF;
  IF to_regclass('public.tag') IS NOT NULL AND to_regclass('public."Tag"') IS NULL THEN
    ALTER TABLE public.tag RENAME TO "Tag";
  END IF;
END $$;

-- ─── Colunas novas em tabelas existentes ─────────────────────────────────────
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaType" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "trialEndAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "trialUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ALTER COLUMN "trialEndAt" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "qrCode" TEXT;
ALTER TABLE "WhatsAppSession" ALTER COLUMN "phoneNumber" DROP NOT NULL;
-- Sessões pendentes antigas gravavam '' (conflitava com o índice único)
UPDATE "WhatsAppSession" SET "phoneNumber" = NULL WHERE "phoneNumber" = '';

-- ─── Tabelas (CREATE IF NOT EXISTS) ──────────────────────────────────────────
-- Coupon / PlanConfig / MercadoPagoConfig já são criadas por migrations
-- anteriores; repetidas aqui (IF NOT EXISTS) para bancos antigos que foram
-- montados com `db push`/scripts manuais e não têm essas tabelas.
CREATE TABLE IF NOT EXISTS "Coupon" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "discount" INTEGER NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "plan" "Plan" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PlanConfig" (
    "id" TEXT NOT NULL,
    "planId" "Plan" NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "features" JSONB NOT NULL,
    "limits" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MercadoPagoConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL DEFAULT '',
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "preapprovalPlanStarterId" TEXT,
    "preapprovalPlanProId" TEXT,
    "preapprovalPlanEnterpriseId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MercadoPagoConfig_pkey" PRIMARY KEY ("id")
);

-- Alinha tipos de data com o schema (migrations antigas usaram TIMESTAMPTZ)
ALTER TABLE "Coupon" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "MercadoPagoConfig" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AppConfig" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuickReply" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shortcode" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TicketTag" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "TicketTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TenantApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "ApiKeyProvider" NOT NULL,
    "keyEnc" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantApiKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpfCnpj" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "gatewayTransactionId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "plan" TEXT NOT NULL,
    "periodMonths" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "mercadopagoPreferenceId" TEXT,
    "mercadopagoStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Permission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "module" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- ─── Colunas TEXT → enum (tabelas criadas por scripts manuais na VPS) ─────────
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'TenantApiKey' AND column_name = 'provider') = 'text' THEN
    ALTER TABLE "TenantApiKey" ALTER COLUMN "provider" TYPE "ApiKeyProvider" USING "provider"::"ApiKeyProvider";
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Permission' AND column_name = 'role') = 'text' THEN
    ALTER TABLE "Permission" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Payment' AND column_name = 'gateway') = 'text' THEN
    ALTER TABLE "Payment" ALTER COLUMN "gateway" TYPE "PaymentGateway" USING "gateway"::"PaymentGateway";
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Payment' AND column_name = 'status') = 'text' THEN
    ALTER TABLE "Payment" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Payment" ALTER COLUMN "status" TYPE "PaymentStatus" USING "status"::"PaymentStatus";
    ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'PENDING';
  END IF;
END $$;

-- ─── Índices ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON "Coupon"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanConfig_planId_key" ON "PlanConfig"("planId");
CREATE UNIQUE INDEX IF NOT EXISTS "MercadoPagoConfig_tenantId_key" ON "MercadoPagoConfig"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "AppConfig_key_key" ON "AppConfig"("key");
CREATE INDEX IF NOT EXISTS "QuickReply_tenantId_idx" ON "QuickReply"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "QuickReply_tenantId_shortcode_key" ON "QuickReply"("tenantId", "shortcode");
CREATE INDEX IF NOT EXISTS "Tag_tenantId_idx" ON "Tag"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_tenantId_name_key" ON "Tag"("tenantId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "TicketTag_ticketId_tagId_key" ON "TicketTag"("ticketId", "tagId");
CREATE INDEX IF NOT EXISTS "TenantApiKey_tenantId_idx" ON "TenantApiKey"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "TenantApiKey_tenantId_provider_key" ON "TenantApiKey"("tenantId", "provider");
CREATE INDEX IF NOT EXISTS "Customer_email_idx" ON "Customer"("email");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_idx" ON "Customer"("tenantId");
CREATE INDEX IF NOT EXISTS "Payment_customerId_idx" ON "Payment"("customerId");
CREATE INDEX IF NOT EXISTS "Payment_gatewayTransactionId_idx" ON "Payment"("gatewayTransactionId");
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" ON "PasswordResetToken"("token");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");
CREATE INDEX IF NOT EXISTS "Permission_tenantId_idx" ON "Permission"("tenantId");
CREATE INDEX IF NOT EXISTS "Permission_role_idx" ON "Permission"("role");
CREATE UNIQUE INDEX IF NOT EXISTS "Permission_tenantId_role_module_key" ON "Permission"("tenantId", "role", "module");
CREATE INDEX IF NOT EXISTS "WhatsAppSession_agentId_idx" ON "WhatsAppSession"("agentId");
-- Pode faltar em bancos antigos criados via `db push` parcial
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppSession_phoneNumber_key" ON "WhatsAppSession"("phoneNumber");

-- ─── Chaves estrangeiras ─────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MercadoPagoConfig" ADD CONSTRAINT "MercadoPagoConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "QuickReply" ADD CONSTRAINT "QuickReply_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Tag" ADD CONSTRAINT "Tag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TicketTag" ADD CONSTRAINT "TicketTag_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TicketTag" ADD CONSTRAINT "TicketTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppSession" ADD CONSTRAINT "WhatsAppSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TenantApiKey" ADD CONSTRAINT "TenantApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Permission" ADD CONSTRAINT "Permission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
