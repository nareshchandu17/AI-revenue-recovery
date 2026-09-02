-- CreateTable
CREATE TABLE "EvaluationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetSeed" INTEGER NOT NULL,
    "datasetVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "modelVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "economicModelVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "sampleSize" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "EvaluationResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evaluationRunId" TEXT NOT NULL,
    "recoveryCaseId" TEXT NOT NULL,
    "amountAtRisk" INTEGER NOT NULL,
    CONSTRAINT "EvaluationResult_evaluationRunId_fkey" FOREIGN KEY ("evaluationRunId") REFERENCES "EvaluationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvaluationResult_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrategyResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evaluationResultId" TEXT NOT NULL,
    "strategyName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "expectedRecovery" INTEGER,
    "expectedIncrementalRecovery" INTEGER,
    "interventionCost" INTEGER,
    "incentiveCost" INTEGER,
    "netExpectedValue" INTEGER,
    "economicDecision" TEXT,
    "simulatedRecoveredAmount" INTEGER NOT NULL DEFAULT 0,
    "isUnnecessary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "StrategyResult_evaluationResultId_fkey" FOREIGN KEY ("evaluationResultId") REFERENCES "EvaluationResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EvaluationRun_startedAt_idx" ON "EvaluationRun"("startedAt");

-- CreateIndex
CREATE INDEX "EvaluationResult_evaluationRunId_idx" ON "EvaluationResult"("evaluationRunId");

-- CreateIndex
CREATE INDEX "EvaluationResult_recoveryCaseId_idx" ON "EvaluationResult"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "StrategyResult_evaluationResultId_idx" ON "StrategyResult"("evaluationResultId");

-- CreateIndex
CREATE INDEX "StrategyResult_strategyName_idx" ON "StrategyResult"("strategyName");

-- CreateIndex
CREATE INDEX "StrategyResult_action_idx" ON "StrategyResult"("action");
