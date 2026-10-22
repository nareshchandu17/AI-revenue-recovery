-- CreateTable
CREATE TABLE "MerchantUser" (
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

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "industry" TEXT NOT NULL DEFAULT 'ecommerce',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "maxContactsPerDay" INTEGER NOT NULL DEFAULT 3,
    "maxContactsPerWeek" INTEGER NOT NULL DEFAULT 7,
    "minContactIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "autonomyLevel" INTEGER NOT NULL DEFAULT 2
);
INSERT INTO "new_Merchant" ("createdAt", "email", "id", "industry", "maxContactsPerDay", "maxContactsPerWeek", "minContactIntervalMinutes", "name", "updatedAt") SELECT "createdAt", "email", "id", "industry", "maxContactsPerDay", "maxContactsPerWeek", "minContactIntervalMinutes", "name", "updatedAt" FROM "Merchant";
DROP TABLE "Merchant";
ALTER TABLE "new_Merchant" RENAME TO "Merchant";
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");
CREATE INDEX "Merchant_email_idx" ON "Merchant"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "MerchantUser_email_key" ON "MerchantUser"("email");

-- CreateIndex
CREATE INDEX "MerchantUser_merchantId_idx" ON "MerchantUser"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantUser_email_idx" ON "MerchantUser"("email");
