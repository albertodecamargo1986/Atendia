-- =============================================================
-- Hotfix SQL para aplicar manualmente na VPS se necessário
-- Uso: docker exec -i atendia-postgres-1 psql -U atend atend_ia < scripts/hotfix-vps.sql
-- =============================================================

-- 1. Extensão trial no Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "trialEndAt" TIMESTAMPTZ;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "trialUsed" BOOLEAN NOT NULL DEFAULT false;

-- 2. Tabela Coupon
CREATE TABLE IF NOT EXISTS "Coupon" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "discount" INTEGER NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "plan" "Plan" NOT NULL,
    "expiresAt" TIMESTAMPTZ,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- 3. Índices e FK
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON "Coupon"("code");
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Marcar migration como aplicada (se Prisma não detectar)
-- INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
-- SELECT gen_random_uuid()::text, 'dummy', NOW(), '20260621030346_add_coupon_trial', NULL, NULL, NOW(), 1
-- WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20260621030346_add_coupon_trial');

\echo 'Hotfix aplicado com sucesso!'
