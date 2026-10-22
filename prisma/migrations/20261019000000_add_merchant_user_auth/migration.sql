-- AddTable MerchantUser
-- Phase 2: Authentication & Authorization
-- Creates the user/credential table for merchant login.

CREATE TABLE IF NOT EXISTS "MerchantUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastLoginAt" DATETIME,
    CONSTRAINT "MerchantUser_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MerchantUser_email_key" ON "MerchantUser"("email");
CREATE INDEX IF NOT EXISTS "MerchantUser_merchantId_idx" ON "MerchantUser"("merchantId");
CREATE INDEX IF NOT EXISTS "MerchantUser_email_idx" ON "MerchantUser"("email");
