#!/bin/bash
# vps-fix-db.sh — Corrige tabelas faltantes e renomeia tabelas no banco PostgreSQL
# Uso: ssh ubuntu@VPS_IP 'bash -s' < scripts/vps-fix-db.sh

set -euo pipefail

echo "===== Iniciando correção do banco de dados AtendIA ====="
echo ""

# 1. Renomear tabelas minúsculas para maiúsculas (Prisma espera case-sensitive)
echo "[1/6] Renomeando tabelas quickreply → QuickReply e tag → Tag..."
docker exec atendia-postgres-1 psql -U atend -d atend_ia -c "
DO \$\$
BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'quickreply') THEN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'QuickReply') THEN
            ALTER TABLE public.quickreply RENAME TO \"QuickReply\";
            RAISE NOTICE 'Renomeado: quickreply → QuickReply';
        END IF;
    END IF;

    IF EXISTS (SELECT FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'tag') THEN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'Tag') THEN
            ALTER TABLE public.tag RENAME TO \"Tag\";
            RAISE NOTICE 'Renomeado: tag → Tag';
        END IF;
    END IF;
END
\$\$;"

echo "  ✅ Tabelas renomeadas com sucesso"

# 2. Criar tabelas faltantes
echo "[2/6] Criando tabelas faltantes..."

docker exec atendia-postgres-1 psql -U atend -d atend_ia <<'SQL'
-- PasswordResetToken
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
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" ON "PasswordResetToken"("token");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT IF EXISTS "PasswordResetToken_userId_fkey";
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT IF EXISTS "PasswordResetToken_tenantId_fkey";
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE;

-- Permission
CREATE TABLE IF NOT EXISTS "Permission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Permission_tenantId_role_module_key" ON "Permission"("tenantId", "role", "module");
CREATE INDEX IF NOT EXISTS "Permission_tenantId_idx" ON "Permission"("tenantId");
ALTER TABLE "Permission" DROP CONSTRAINT IF EXISTS "Permission_tenantId_fkey";
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE;

-- TenantApiKey
CREATE TABLE IF NOT EXISTS "TenantApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "keyEnc" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TenantApiKey_tenantId_provider_key" ON "TenantApiKey"("tenantId", "provider");
CREATE INDEX IF NOT EXISTS "TenantApiKey_tenantId_idx" ON "TenantApiKey"("tenantId");
ALTER TABLE "TenantApiKey" DROP CONSTRAINT IF EXISTS "TenantApiKey_tenantId_fkey";
ALTER TABLE "TenantApiKey" ADD CONSTRAINT "TenantApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE;

-- Customer
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
CREATE INDEX IF NOT EXISTS "Customer_email_idx" ON "Customer"("email");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_idx" ON "Customer"("tenantId");
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_tenantId_fkey";
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL;

-- License
CREATE TABLE IF NOT EXISTS "License" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "hwid" TEXT,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "transferCount" INTEGER NOT NULL DEFAULT 0,
    "lastTransferredAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "License_serial_key" ON "License"("serial");
CREATE INDEX IF NOT EXISTS "License_customerId_idx" ON "License"("customerId");
CREATE INDEX IF NOT EXISTS "License_status_idx" ON "License"("status");
ALTER TABLE "License" DROP CONSTRAINT IF EXISTS "License_customerId_fkey";
ALTER TABLE "License" ADD CONSTRAINT "License_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE;

-- LicenseEvent
CREATE TABLE IF NOT EXISTS "LicenseEvent" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "hwid" TEXT,
    "ip" TEXT,
    "eventType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LicenseEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LicenseEvent_licenseId_idx" ON "LicenseEvent"("licenseId");
CREATE INDEX IF NOT EXISTS "LicenseEvent_createdAt_idx" ON "LicenseEvent"("createdAt");
ALTER TABLE "LicenseEvent" DROP CONSTRAINT IF EXISTS "LicenseEvent_licenseId_fkey";
ALTER TABLE "LicenseEvent" ADD CONSTRAINT "LicenseEvent_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE;

-- Payment
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "licenseId" TEXT,
    "licenseSerial" TEXT,
    "gateway" TEXT NOT NULL,
    "gatewayTransactionId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "plan" TEXT NOT NULL,
    "periodMonths" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "mercadopagoPreferenceId" TEXT,
    "mercadopagoStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Payment_customerId_idx" ON "Payment"("customerId");
CREATE INDEX IF NOT EXISTS "Payment_licenseId_idx" ON "Payment"("licenseId");
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_customerId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE;
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_licenseId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE SET NULL;

-- TicketTag
CREATE TABLE IF NOT EXISTS "TicketTag" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "TicketTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TicketTag_ticketId_tagId_key" ON "TicketTag"("ticketId", "tagId");
ALTER TABLE "TicketTag" DROP CONSTRAINT IF EXISTS "TicketTag_ticketId_fkey";
ALTER TABLE "TicketTag" ADD CONSTRAINT "TicketTag_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE;
ALTER TABLE "TicketTag" DROP CONSTRAINT IF EXISTS "TicketTag_tagId_fkey";
ALTER TABLE "TicketTag" ADD CONSTRAINT "TicketTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE;
SQL

echo "  ✅ Tabelas criadas com sucesso"

# 3. Verificar tabelas
echo "[3/6] Verificando tabelas..."
docker exec atendia-postgres-1 psql -U atend -d atend_ia -c "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename;"

# 4. Gerar Prisma client
echo "[4/6] Regenerando Prisma Client no backend..."
docker exec atendia-backend-1 npx prisma generate --schema=/app/packages/backend/prisma/schema.prisma 2>&1 || true

# 5. Rodar migracoes Prisma (se houver)
echo "[5/6] Rodando prisma migrate deploy..."
docker exec atendia-backend-1 npx prisma migrate deploy --schema=/app/packages/backend/prisma/schema.prisma 2>&1 || true

# 6. Restart backend
echo "[6/6] Reiniciando backend..."
docker restart atendia-backend-1

echo ""
echo "===== Correção concluída! ====="
echo "Aguarde 10 segundos e verifique os logs com:"
echo "  docker logs atendia-backend-1 --tail 30"
