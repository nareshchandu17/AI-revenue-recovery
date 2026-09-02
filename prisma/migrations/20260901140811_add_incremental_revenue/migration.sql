-- CreateTable
CREATE TABLE "IncrementalRevenue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recoveryCaseId" TEXT NOT NULL,
    "recoveryAttemptId" TEXT,
    "paymentId" TEXT NOT NULL,
    "attributionType" TEXT NOT NULL,
    "recoveredAmount" INTEGER NOT NULL,
    "baselineExpectedAmount" INTEGER NOT NULL,
    "incrementalAmount" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "methodologyVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "evaluatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'calculated',
    CONSTRAINT "IncrementalRevenue_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IncrementalRevenue_recoveryAttemptId_fkey" FOREIGN KEY ("recoveryAttemptId") REFERENCES "RecoveryAttempt" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IncrementalRevenue_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "IncrementalRevenue_recoveryCaseId_idx" ON "IncrementalRevenue"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "IncrementalRevenue_attributionType_idx" ON "IncrementalRevenue"("attributionType");

-- CreateIndex
CREATE UNIQUE INDEX "IncrementalRevenue_recoveryCaseId_paymentId_key" ON "IncrementalRevenue"("recoveryCaseId", "paymentId");
