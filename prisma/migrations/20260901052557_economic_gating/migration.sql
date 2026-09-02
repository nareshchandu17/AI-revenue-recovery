-- AlterTable
ALTER TABLE "AgentDecision" ADD COLUMN "baselineExpectedRecovery" INTEGER;
ALTER TABLE "AgentDecision" ADD COLUMN "economicDecision" TEXT;
ALTER TABLE "AgentDecision" ADD COLUMN "economicModelVersion" TEXT;
ALTER TABLE "AgentDecision" ADD COLUMN "economicReason" TEXT;
ALTER TABLE "AgentDecision" ADD COLUMN "expectedIncrementalRecovery" INTEGER;
ALTER TABLE "AgentDecision" ADD COLUMN "expectedRecovery" INTEGER;
ALTER TABLE "AgentDecision" ADD COLUMN "incentiveCost" INTEGER;
ALTER TABLE "AgentDecision" ADD COLUMN "interventionCost" INTEGER;
ALTER TABLE "AgentDecision" ADD COLUMN "netExpectedValue" INTEGER;
