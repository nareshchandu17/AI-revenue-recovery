/**
 * AI Recovery Decision Agent — main orchestrator.
 *
 * Flow:
 *   1. Load case + build context
 *   2. Call AI provider (or fallback)
 *   3. Validate structured output with Zod
 *   4. Run policy guardrails
 *   5. Store AgentDecision in DB
 *   6. Create AuditEvents
 *   7. Return result
 *
 * IMPORTANT: This agent produces RECOMMENDATIONS only.
 * It never executes financial actions.
 */

import { OPEN_CASE_STATUSES } from "../detection/constants"
import { db } from "@/lib/db"
import { getAIProvider, isAIAvailable } from "@/services/ai"
import { logAudit } from "@/services/audit/log"
import { validateAIDecision } from "./schemas"
import { buildRecoveryContext } from "./context"
import { getSystemPrompt, buildUserMessage, PROMPT_VERSION } from "./prompt"
import { validatePolicy, DEFAULT_MERCHANT_POLICY } from "./policy"
import { deterministicFallback } from "./fallback"
import type {
  AIDecisionOutput,
  AgentAction,
  AgentAnalysisResult,
  BatchAnalysisResult,
  MerchantPolicy,
  PolicyResult,
  RecoveryContext,
} from "./types"
import {
  AIOutputValidationError,
  AIProviderError,
  AIAgentError,
} from "./types"

// --- Single Case Analysis --------------------------------------------------

export interface AnalyzeCaseParams {
  caseId: string
  policy?: MerchantPolicy
}

/**
 * Analyze a single recovery case with the AI agent.
 *
 * This is the main entry point for the decision pipeline.
 */
export async function analyzeCase(
  params: AnalyzeCaseParams
): Promise<AgentAnalysisResult> {
  const { caseId, policy = DEFAULT_MERCHANT_POLICY } = params
  const usedFallback = false

  // 1. Build context
  const context = await buildRecoveryContext(caseId, policy)

  // 2. Get AI decision (or fallback)
  let aiDecision: AIDecisionOutput
  try {
    aiDecision = await callAI(context)
  } catch (err) {
    // AI failed — use deterministic fallback
    const fallbackResult = handleAIFailure(err, context)
    return fallbackResult
  }

  // 3. Run policy validation
  const existingAttempts = await db.recoveryAttempt.count({
    where: { recoveryCaseId: caseId },
  })

  const lastAttempt = await db.recoveryAttempt.findFirst({
    where: { recoveryCaseId: caseId },
    orderBy: { attemptedAt: "desc" },
    select: { attemptedAt: true },
  })

  const policyResult = validatePolicy({
    aiDecision,
    policy,
    caseStatus: context.case.status,
    amountAtRisk: context.case.amountAtRisk,
    recoveryProbability: context.case.recoveryProbability,
    existingAttemptCount: existingAttempts,
    lastAttemptAt: lastAttempt?.attemptedAt ?? null,
  })

  // 4. Determine final action
  const finalAction = policyResult.allowed
    ? aiDecision.action
    : policyResult.finalAction

  // 5. Persist AgentDecision
  const decision = await persistDecision({
    caseId,
    context,
    aiDecision,
    finalAction,
    policyResult,
    usedFallback,
  })

  // 6. Audit trail
  await auditDecision({
    caseId,
    decisionId: decision.id,
    aiDecision,
    finalAction,
    policyResult,
    usedFallback,
  })

  return {
    caseId,
    recommendedAction: aiDecision.action,
    finalAction,
    confidence: aiDecision.confidence,
    allowed: policyResult.allowed,
    reason: aiDecision.reason,
    factors: aiDecision.factors,
    riskLevel: aiDecision.riskLevel,
    customerIntent: aiDecision.customerIntent,
    policyResult,
    usedFallback,
    decisionId: decision.id,
  }
}

// --- Batch Analysis --------------------------------------------------------

const MAX_BATCH_SIZE = 50

export interface BatchAnalyzeParams {
  limit?: number
  policy?: MerchantPolicy
}

/**
 * Analyze multiple eligible recovery cases.
 * Processes a bounded batch — never unbounded.
 */
export async function batchAnalyze(
  params: BatchAnalyzeParams = {}
): Promise<BatchAnalysisResult> {
  const limit = Math.min(params.limit ?? 20, MAX_BATCH_SIZE)
  const policy = params.policy ?? DEFAULT_MERCHANT_POLICY

  const result: BatchAnalysisResult = {
    processed: 0,
    decisionsCreated: 0,
    rejected: 0,
    errors: [],
  }

  // Find cases that are in open states and have no prior decision
  const cases = await db.recoveryCase.findMany({
    where: {
      status: { in: [...OPEN_CASE_STATUSES] },
      agentDecisions: { none: {} },
    },
    orderBy: [
      { priority: "desc" },
      { detectedAt: "asc" },
    ],
    take: limit,
  })

  for (const recoveryCase of cases) {
    result.processed++
    try {
      const analysis = await analyzeCase({
        caseId: recoveryCase.id,
        policy,
      })
      if (analysis.allowed) {
        result.decisionsCreated++
      } else {
        result.rejected++
      }
    } catch (err) {
      result.errors.push(
        `Case ${recoveryCase.id}: ${err instanceof Error ? err.message : String(err)}`
      )
      result.rejected++
    }
  }

  return result
}

// --- Internal: AI Call -----------------------------------------------------

async function callAI(context: RecoveryContext): Promise<AIDecisionOutput> {
  if (!isAIAvailable()) {
    throw new AIProviderError("AI provider not configured")
  }

  const provider = getAIProvider()
  const systemPrompt = getSystemPrompt()
  const userMessage = buildUserMessage(context)

  let response
  try {
    response = await provider.complete({
      systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      temperature: 0.1, // Low temperature for deterministic decisions
      maxTokens: 1024,
    })
  } catch (err) {
    throw new AIProviderError(
      `AI provider call failed: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined
    )
  }

  if (!response.content || response.content.trim().length === 0) {
    throw new AIProviderError("AI returned empty response")
  }

  // Try to parse JSON from the response
  let parsed: unknown
  const content = response.content.trim()

  // Extract JSON if the model wrapped it in markdown code blocks
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content

  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new AIOutputValidationError(
      `AI response is not valid JSON: ${content.slice(0, 200)}`,
      ["Failed to parse JSON from AI response"]
    )
  }

  // Validate against Zod schema
  return validateAIDecision(parsed)
}

// --- Internal: AI Failure Handler -----------------------------------------

async function handleAIFailure(
  err: unknown,
  context: RecoveryContext
): Promise<AgentAnalysisResult> {
  const errorMsg =
    err instanceof Error ? err.message : String(err)

  // Log the failure
  await logAudit({
    caseId: context.case.id,
    actor: { type: "system" },
    eventType: "agent.ai_failure",
    entityType: "agent_decision",
    entityId: context.case.id,
    action: "ai_failure",
    details: `AI provider failed: ${errorMsg}. Using deterministic fallback.`,
    metadata: {
      error: errorMsg,
      caseId: context.case.id,
      providerError: err instanceof AIAgentError ? err.code : "UNKNOWN",
    },
  })

  // Use deterministic fallback
  const fallbackDecision = deterministicFallback({
    recoveryProbability: context.case.recoveryProbability,
    priority: context.case.priority,
    caseStatus: context.case.status,
    amountAtRisk: context.case.amountAtRisk,
    category: context.case.category,
  })

  // Policy check even on fallback
  const policyResult = validatePolicy({
    aiDecision: fallbackDecision,
    policy: DEFAULT_MERCHANT_POLICY,
    caseStatus: context.case.status,
    amountAtRisk: context.case.amountAtRisk,
    recoveryProbability: context.case.recoveryProbability,
    existingAttemptCount: context.previousAttempts.length,
    lastAttemptAt:
      context.previousAttempts.length > 0
        ? new Date(context.previousAttempts[0].attemptedAt)
        : null,
  })

  const finalAction = policyResult.allowed
    ? fallbackDecision.action
    : policyResult.finalAction

  // Persist the fallback decision
  const decision = await persistDecision({
    caseId: context.case.id,
    context,
    aiDecision: fallbackDecision,
    finalAction,
    policyResult,
    usedFallback: true,
  })

  await auditDecision({
    caseId: context.case.id,
    decisionId: decision.id,
    aiDecision: fallbackDecision,
    finalAction,
    policyResult,
    usedFallback: true,
  })

  return {
    caseId: context.case.id,
    recommendedAction: fallbackDecision.action,
    finalAction,
    confidence: fallbackDecision.confidence,
    allowed: policyResult.allowed,
    reason: fallbackDecision.reason,
    factors: fallbackDecision.factors,
    riskLevel: fallbackDecision.riskLevel,
    customerIntent: fallbackDecision.customerIntent,
    policyResult,
    usedFallback: true,
    decisionId: decision.id,
  }
}

// --- Internal: Persist Decision -------------------------------------------

interface PersistParams {
  caseId: string
  context: RecoveryContext
  aiDecision: AIDecisionOutput
  finalAction: AgentAction
  policyResult: PolicyResult
  usedFallback: boolean
}

async function persistDecision(params: PersistParams) {
  const { caseId, context, aiDecision, finalAction, policyResult, usedFallback } = params

  // Map the AI output to observation + diagnosis for the AgentDecision model
  const observation = [
    `Category: ${context.case.category}`,
    `Priority: ${context.case.priority}`,
    `Amount: ${context.case.amountDisplay}`,
    `Recovery probability: ${(context.case.recoveryProbability * 100).toFixed(0)}%`,
    `Customer success rate: ${(context.customer.successRate * 100).toFixed(0)}%`,
    `Payment method: ${context.source.paymentMethod || "unknown"}`,
  ].join("\n")

  const diagnosis = `${aiDecision.action}: ${aiDecision.reason}`

  const reasoningJson = JSON.stringify({
    promptVersion: PROMPT_VERSION,
    aiOutput: {
      action: aiDecision.action,
      confidence: aiDecision.confidence,
      reason: aiDecision.reason,
      factors: aiDecision.factors,
      riskLevel: aiDecision.riskLevel,
      customerIntent: aiDecision.customerIntent,
      recommendedDelayMinutes: aiDecision.recommendedDelayMinutes,
      stopReason: aiDecision.stopReason,
    },
    policyResult: {
      allowed: policyResult.allowed,
      finalAction: policyResult.finalAction,
      rejectionReason: policyResult.rejectionReason,
      policyViolations: policyResult.policyViolations,
    },
    usedFallback,
  })

  return db.agentDecision.create({
    data: {
      recoveryCaseId: caseId,
      observation,
      diagnosis,
      reasoningJson,
      recommendedAction: aiDecision.action,
      confidence: aiDecision.confidence,
      recoveryProbability: context.case.recoveryProbability,
      status: policyResult.allowed ? "approved" : "rejected",
    },
  })
}

// --- Internal: Audit ------------------------------------------------------

interface AuditParams {
  caseId: string
  decisionId: string
  aiDecision: AIDecisionOutput
  finalAction: AgentAction
  policyResult: PolicyResult
  usedFallback: boolean
}

async function auditDecision(params: AuditParams) {
  const { caseId, decisionId, aiDecision, finalAction, policyResult, usedFallback } = params

  const eventType = policyResult.allowed
    ? "AGENT_DECISION_APPROVED"
    : "AGENT_DECISION_REJECTED"

  const details = [
    `AI recommended: ${aiDecision.action} (${(aiDecision.confidence * 100).toFixed(0)}% confidence)`,
    `Policy: ${policyResult.allowed ? "APPROVED" : "REJECTED"}`,
    policyResult.rejectionReason
      ? `Rejection: ${policyResult.rejectionReason}`
      : null,
    `Final action: ${finalAction}`,
    usedFallback ? "(fallback mode — AI unavailable)" : null,
  ]
    .filter(Boolean)
    .join(" | ")

  await logAudit({
    caseId,
    actor: { type: "ai_agent" },
    eventType,
    entityType: "agent_decision",
    entityId: decisionId,
    action: finalAction,
    details,
    metadata: {
      recommendedAction: aiDecision.action,
      finalAction,
      confidence: aiDecision.confidence,
      factors: aiDecision.factors,
      riskLevel: aiDecision.riskLevel,
      customerIntent: aiDecision.customerIntent,
      policyViolations: policyResult.policyViolations,
      usedFallback,
      promptVersion: PROMPT_VERSION,
    },
  })
}
