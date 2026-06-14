-- AlterTable
ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "twoFactorSecret" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_phoneNumber_key" ON "WhatsAppSession"("phoneNumber");
