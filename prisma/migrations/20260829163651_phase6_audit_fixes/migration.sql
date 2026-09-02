-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "industry" TEXT NOT NULL DEFAULT 'ecommerce',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "maxContactsPerDay" INTEGER NOT NULL DEFAULT 3,
    "maxContactsPerWeek" INTEGER NOT NULL DEFAULT 7,
    "minContactIntervalMinutes" INTEGER NOT NULL DEFAULT 60
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "displayName" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "emailOptOut" BOOLEAN NOT NULL DEFAULT false,
    "smsOptOut" BOOLEAN NOT NULL DEFAULT false,
    "whatsappOptOut" BOOLEAN NOT NULL DEFAULT false,
    "voiceOptOut" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" DATETIME,
    "optOutReason" TEXT NOT NULL DEFAULT '',
    "optOutSource" TEXT NOT NULL DEFAULT 'SYSTEM',
    CONSTRAINT "Customer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'created',
    "method" TEXT,
    "failureCode" TEXT NOT NULL DEFAULT '',
    "failureReason" TEXT NOT NULL DEFAULT '',
    "amountRefunded" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Checkout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'created',
    "itemsJson" TEXT NOT NULL DEFAULT '[]',
    "abandonedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Checkout_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Checkout_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'active',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "currentPeriodStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecoveryCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "paymentId" TEXT,
    "checkoutId" TEXT,
    "subscriptionId" TEXT,
    "amountAtRisk" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'detected',
    "recoveryProbability" REAL NOT NULL DEFAULT 0,
    "recoveredAmount" INTEGER NOT NULL DEFAULT 0,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecoveryCase_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecoveryCase_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recoveryCaseId" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "reasoningJson" TEXT NOT NULL DEFAULT '{}',
    "recommendedAction" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "recoveryProbability" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT NOT NULL DEFAULT '',
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentDecision_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecoveryAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recoveryCaseId" TEXT NOT NULL,
    "agentDecisionId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "recoveredAmount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT NOT NULL DEFAULT '',
    "failureCategory" TEXT,
    "nextStep" TEXT,
    "externalRef" TEXT NOT NULL DEFAULT '',
    "jobId" TEXT NOT NULL DEFAULT '',
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" DATETIME,
    "startedAt" DATETIME,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reconciliationAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastReconciledAt" DATETIME,
    "nextReconciliationAt" DATETIME,
    "finalReconciliationStatus" TEXT,
    CONSTRAINT "RecoveryAttempt_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecoveryAttempt_agentDecisionId_fkey" FOREIGN KEY ("agentDecisionId") REFERENCES "AgentDecision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "actorId" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RecoveryCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunicationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "recoveryCaseId" TEXT,
    "recoveryAttemptId" TEXT,
    "action" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "blockReason" TEXT,
    "nextEligibleAt" DATETIME,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunicationEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationEvent_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommunicationEvent_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CommunicationEvent_recoveryAttemptId_fkey" FOREIGN KEY ("recoveryAttemptId") REFERENCES "RecoveryAttempt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecoveryAttribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recoveryCaseId" TEXT NOT NULL,
    "recoveryAttemptId" TEXT,
    "paymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecoveryAttribution_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecoveryAttribution_recoveryAttemptId_fkey" FOREIGN KEY ("recoveryAttemptId") REFERENCES "RecoveryAttempt" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecoveryAttribution_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecoveryProbabilityEstimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recoveryCaseId" TEXT NOT NULL,
    "agentDecisionId" TEXT,
    "action" TEXT NOT NULL,
    "probability" REAL NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "factorsJson" TEXT NOT NULL DEFAULT '[]',
    "modelVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecoveryProbabilityEstimate_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecoveryProbabilityEstimate_agentDecisionId_fkey" FOREIGN KEY ("agentDecisionId") REFERENCES "AgentDecision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InterventionEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recoveryAttemptId" TEXT NOT NULL,
    "recoveryCaseId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "classificationReason" TEXT NOT NULL,
    "evaluationVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "evaluatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterventionEvaluation_recoveryAttemptId_fkey" FOREIGN KEY ("recoveryAttemptId") REFERENCES "RecoveryAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InterventionEvaluation_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskAnomaly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "baselineValue" REAL NOT NULL,
    "observedValue" REAL NOT NULL,
    "deviation" REAL NOT NULL,
    "severity" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "baselineSampleSize" INTEGER NOT NULL,
    "detectionVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'active',
    "resolvedAt" DATETIME,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskAnomaly_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InterventionFeedbackStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "trialCount" INTEGER NOT NULL DEFAULT 0,
    "recoveredAmount" INTEGER NOT NULL DEFAULT 0,
    "eligibleAmount" INTEGER NOT NULL DEFAULT 0,
    "smoothedProbability" REAL NOT NULL DEFAULT 0,
    "confidence" REAL NOT NULL DEFAULT 0,
    "feedbackModelVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterventionFeedbackStats_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InterventionFeedbackRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "recoveryCaseId" TEXT NOT NULL,
    "recoveryAttemptId" TEXT NOT NULL,
    "interventionEvaluationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "recoveredAmount" INTEGER NOT NULL DEFAULT 0,
    "eligibleAmount" INTEGER NOT NULL DEFAULT 0,
    "customerValueSegment" TEXT NOT NULL DEFAULT 'unknown',
    "failureReason" TEXT NOT NULL DEFAULT '',
    "anomalyActive" BOOLEAN NOT NULL DEFAULT false,
    "feedbackModelVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterventionFeedbackRecord_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InterventionFeedbackRecord_interventionEvaluationId_fkey" FOREIGN KEY ("interventionEvaluationId") REFERENCES "InterventionEvaluation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "providerEventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");

-- CreateIndex
CREATE INDEX "Merchant_email_idx" ON "Merchant"("email");

-- CreateIndex
CREATE INDEX "Customer_merchantId_idx" ON "Customer"("merchantId");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_merchantId_doNotContact_idx" ON "Customer"("merchantId", "doNotContact");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_merchantId_email_key" ON "Customer"("merchantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalId_key" ON "Payment"("externalId");

-- CreateIndex
CREATE INDEX "Payment_merchantId_status_idx" ON "Payment"("merchantId", "status");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Checkout_merchantId_status_idx" ON "Checkout"("merchantId", "status");

-- CreateIndex
CREATE INDEX "Checkout_customerId_idx" ON "Checkout"("customerId");

-- CreateIndex
CREATE INDEX "Checkout_status_idx" ON "Checkout"("status");

-- CreateIndex
CREATE INDEX "Checkout_createdAt_idx" ON "Checkout"("createdAt");

-- CreateIndex
CREATE INDEX "Subscription_merchantId_status_idx" ON "Subscription"("merchantId", "status");

-- CreateIndex
CREATE INDEX "Subscription_customerId_idx" ON "Subscription"("customerId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCase_paymentId_key" ON "RecoveryCase"("paymentId");

-- CreateIndex
CREATE INDEX "RecoveryCase_merchantId_status_idx" ON "RecoveryCase"("merchantId", "status");

-- CreateIndex
CREATE INDEX "RecoveryCase_status_idx" ON "RecoveryCase"("status");

-- CreateIndex
CREATE INDEX "RecoveryCase_priority_idx" ON "RecoveryCase"("priority");

-- CreateIndex
CREATE INDEX "RecoveryCase_category_idx" ON "RecoveryCase"("category");

-- CreateIndex
CREATE INDEX "RecoveryCase_detectedAt_idx" ON "RecoveryCase"("detectedAt");

-- CreateIndex
CREATE INDEX "AgentDecision_recoveryCaseId_idx" ON "AgentDecision"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "AgentDecision_status_idx" ON "AgentDecision"("status");

-- CreateIndex
CREATE INDEX "RecoveryAttempt_recoveryCaseId_idx" ON "RecoveryAttempt"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "RecoveryAttempt_agentDecisionId_idx" ON "RecoveryAttempt"("agentDecisionId");

-- CreateIndex
CREATE INDEX "RecoveryAttempt_status_idx" ON "RecoveryAttempt"("status");

-- CreateIndex
CREATE INDEX "RecoveryAttempt_attemptedAt_idx" ON "RecoveryAttempt"("attemptedAt");

-- CreateIndex
CREATE INDEX "RecoveryAttempt_recoveryCaseId_attemptNumber_idx" ON "RecoveryAttempt"("recoveryCaseId", "attemptNumber");

-- CreateIndex
CREATE INDEX "AuditEvent_caseId_idx" ON "AuditEvent"("caseId");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "AuditEvent_actorType_idx" ON "AuditEvent"("actorType");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationEvent_recoveryAttemptId_key" ON "CommunicationEvent"("recoveryAttemptId");

-- CreateIndex
CREATE INDEX "CommunicationEvent_customerId_createdAt_idx" ON "CommunicationEvent"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationEvent_customerId_channel_idx" ON "CommunicationEvent"("customerId", "channel");

-- CreateIndex
CREATE INDEX "CommunicationEvent_merchantId_customerId_createdAt_idx" ON "CommunicationEvent"("merchantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationEvent_recoveryCaseId_idx" ON "CommunicationEvent"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "CommunicationEvent_recoveryAttemptId_idx" ON "CommunicationEvent"("recoveryAttemptId");

-- CreateIndex
CREATE INDEX "CommunicationEvent_status_idx" ON "CommunicationEvent"("status");

-- CreateIndex
CREATE INDEX "CommunicationEvent_createdAt_idx" ON "CommunicationEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationEvent_idempotencyKey_key" ON "CommunicationEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RecoveryAttribution_recoveryCaseId_idx" ON "RecoveryAttribution"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "RecoveryAttribution_recoveryAttemptId_idx" ON "RecoveryAttribution"("recoveryAttemptId");

-- CreateIndex
CREATE INDEX "RecoveryAttribution_paymentId_idx" ON "RecoveryAttribution"("paymentId");

-- CreateIndex
CREATE INDEX "RecoveryAttribution_status_idx" ON "RecoveryAttribution"("status");

-- CreateIndex
CREATE INDEX "RecoveryAttribution_source_idx" ON "RecoveryAttribution"("source");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryAttribution_recoveryCaseId_paymentId_key" ON "RecoveryAttribution"("recoveryCaseId", "paymentId");

-- CreateIndex
CREATE INDEX "RecoveryProbabilityEstimate_recoveryCaseId_idx" ON "RecoveryProbabilityEstimate"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "RecoveryProbabilityEstimate_agentDecisionId_idx" ON "RecoveryProbabilityEstimate"("agentDecisionId");

-- CreateIndex
CREATE INDEX "RecoveryProbabilityEstimate_action_idx" ON "RecoveryProbabilityEstimate"("action");

-- CreateIndex
CREATE INDEX "RecoveryProbabilityEstimate_modelVersion_idx" ON "RecoveryProbabilityEstimate"("modelVersion");

-- CreateIndex
CREATE UNIQUE INDEX "InterventionEvaluation_recoveryAttemptId_key" ON "InterventionEvaluation"("recoveryAttemptId");

-- CreateIndex
CREATE INDEX "InterventionEvaluation_recoveryCaseId_idx" ON "InterventionEvaluation"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "InterventionEvaluation_outcome_idx" ON "InterventionEvaluation"("outcome");

-- CreateIndex
CREATE INDEX "InterventionEvaluation_evaluationVersion_idx" ON "InterventionEvaluation"("evaluationVersion");

-- CreateIndex
CREATE INDEX "InterventionEvaluation_evaluatedAt_idx" ON "InterventionEvaluation"("evaluatedAt");

-- CreateIndex
CREATE INDEX "RiskAnomaly_merchantId_status_idx" ON "RiskAnomaly"("merchantId", "status");

-- CreateIndex
CREATE INDEX "RiskAnomaly_severity_idx" ON "RiskAnomaly"("severity");

-- CreateIndex
CREATE INDEX "RiskAnomaly_metric_idx" ON "RiskAnomaly"("metric");

-- CreateIndex
CREATE INDEX "RiskAnomaly_detectedAt_idx" ON "RiskAnomaly"("detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskAnomaly_merchantId_metric_windowStart_windowEnd_detectionVersion_key" ON "RiskAnomaly"("merchantId", "metric", "windowStart", "windowEnd", "detectionVersion");

-- CreateIndex
CREATE INDEX "InterventionFeedbackStats_merchantId_idx" ON "InterventionFeedbackStats"("merchantId");

-- CreateIndex
CREATE INDEX "InterventionFeedbackStats_action_idx" ON "InterventionFeedbackStats"("action");

-- CreateIndex
CREATE INDEX "InterventionFeedbackStats_feedbackModelVersion_idx" ON "InterventionFeedbackStats"("feedbackModelVersion");

-- CreateIndex
CREATE UNIQUE INDEX "InterventionFeedbackStats_merchantId_action_feedbackModelVersion_key" ON "InterventionFeedbackStats"("merchantId", "action", "feedbackModelVersion");

-- CreateIndex
CREATE INDEX "InterventionFeedbackRecord_merchantId_action_idx" ON "InterventionFeedbackRecord"("merchantId", "action");

-- CreateIndex
CREATE INDEX "InterventionFeedbackRecord_action_outcome_idx" ON "InterventionFeedbackRecord"("action", "outcome");

-- CreateIndex
CREATE INDEX "InterventionFeedbackRecord_feedbackModelVersion_idx" ON "InterventionFeedbackRecord"("feedbackModelVersion");

-- CreateIndex
CREATE INDEX "InterventionFeedbackRecord_createdAt_idx" ON "InterventionFeedbackRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterventionFeedbackRecord_interventionEvaluationId_key" ON "InterventionFeedbackRecord"("interventionEvaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_providerEventId_key" ON "WebhookEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_merchantId_idx" ON "WebhookEvent"("merchantId");

-- CreateIndex
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");
