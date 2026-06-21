-- CreateTable: MercadoPagoConfig
CREATE TABLE IF NOT EXISTS "MercadoPagoConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL DEFAULT '',
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "preapprovalPlanStarterId" TEXT,
    "preapprovalPlanProId" TEXT,
    "preapprovalPlanEnterpriseId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "MercadoPagoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MercadoPagoConfig_tenantId_key" ON "MercadoPagoConfig"("tenantId");

-- AddForeignKey
ALTER TABLE "MercadoPagoConfig" ADD CONSTRAINT "MercadoPagoConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
