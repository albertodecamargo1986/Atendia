-- AtendIA: Add Licensing & Payments models
-- Migration: add_licensing_payments

-- Create enums
CREATE TYPE "LicensePlan" AS ENUM ('STARTER', 'PRO', 'ENTERPRISE');
CREATE TYPE "LicenseStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'EXPIRED', 'REVOKED', 'SUSPENDED');
CREATE TYPE "LicenseEventType" AS ENUM ('ACTIVATE', 'HEARTBEAT', 'TRANSFER', 'REVOKE', 'EXPIRE');
CREATE TYPE "PaymentGateway" AS ENUM ('MERCADOPAGO', 'STRIPE', 'MANUAL');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK');

-- Add Customer relation to Tenant
-- (Prisma will handle this on next generate, no DDL change needed since it's a virtual relation)

-- Create Customer table
CREATE TABLE "Customer" (
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

-- Create License table
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "plan" "LicensePlan" NOT NULL DEFAULT 'STARTER',
    "status" "LicenseStatus" NOT NULL DEFAULT 'INACTIVE',
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

-- Create LicenseEvent table
CREATE TABLE "LicenseEvent" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "hwid" TEXT,
    "ip" TEXT,
    "eventType" "LicenseEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseEvent_pkey" PRIMARY KEY ("id")
);

-- Create Payment table
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "licenseId" TEXT,
    "licenseSerial" TEXT,
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

-- Create indexes
CREATE INDEX "Customer_email_idx" ON "Customer"("email");
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");
CREATE UNIQUE INDEX "License_serial_key" ON "License"("serial");
CREATE INDEX "License_customerId_idx" ON "License"("customerId");
CREATE INDEX "License_serial_idx" ON "License"("serial");
CREATE INDEX "License_status_idx" ON "License"("status");
CREATE INDEX "LicenseEvent_licenseId_idx" ON "LicenseEvent"("licenseId");
CREATE INDEX "LicenseEvent_createdAt_idx" ON "LicenseEvent"("createdAt");
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");
CREATE INDEX "Payment_licenseId_idx" ON "Payment"("licenseId");
CREATE INDEX "Payment_gatewayTransactionId_idx" ON "Payment"("gatewayTransactionId");

-- Add foreign keys
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "License" ADD CONSTRAINT "License_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LicenseEvent" ADD CONSTRAINT "LicenseEvent_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE SET NULL ON UPDATE CASCADE;
