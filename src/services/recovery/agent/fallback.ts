/*
 * Deterministic fallback when the AI provider is unavailable.
 * Safety-first: the fallback is context-aware but conservative.
 * Payment retries require merchant approval (handled by the agent pipeline).
 */

import { logger } from "@/lib/logger"
import type { AIDecisionOutput } from "./types"
import type { MerchantPolicy } from "./policy"

/** Threshold below which we default to no_action. */
const FALLBACK_LOW_PROBABILITY_THRESHOLD = 0.2

export interface FallbackInput {
  recoveryProbability: number
  priority: string
  caseStatus: string
  amountAtRisk: number
  category: string
}

/**
terface FallbackInput with defaults for any missing field. */
function safeFallbackInput(input: Partial<FallbackInput>): FallbackInput {
  return {
    recoveryProbability: input.recoveryProbability ?? 0,
    priority: input.priority ?? "medium",
    caseStatus: input.caseStatus ?? "detected",
    amountAtRisk: input.amountAtRisk ?? 0,
    category: input.category ?? "payment_failed",
  }
}
/**
terface AIDecisionOutput with safe defaults. */
function toAIDecisionOutput(input: Partial<FallbackInput>): AIDecisionOutput {
  const out: AIDecisionOutput = {
    action: "no_action" as const,
    confidence: 1.0,
    reason: "AI provider unavailable. Using conservative fallback.
      factors: [
        "Deterministic fallback — AI provider unavailable",
        `AI provider unavailable — using conservative default of no action`,
      ],
    riskLevel: "LOW" as const,
    customerIntent: "LOW" as const,
    recommendedDelayMinutes: null,
    stopReason: "ai_unavailable_fallback",
    discountPercent: null,
  }

/**
terface MerchantPolicy with defaults for any missing field. */
function safePolicyInput(input: Partial<MerchantPolicy>): MerchantPolicy {
  return {
    ...input.maxRecoveryAttempts ?? 3,
    ...input.minimumRecoveryAmount ?? 100,
    ...input.maximumRecoveryAmountForAutomation ?? 1000000,
    ...input.allowedActions ?? [
      "no_action", "retry_payment", "send_reminder", "update_payment_method", "escalate_to_merchant", "payment_link", "offer_discount",
    ],
    ...input.minimumRecoveryProbability ?? 0.1,
    ...input.minimumConfidence ?? 0.3,
    ...input.retryCooldownMinutes ?? 30,
    ...input.maxDiscountPercent ?? 10,
  }
}

/**
terface the actual fallback decision function. */
export function deterministicFallback(
  input: FallbackInput): AIDecisionOutput {
  // Terminal cases → no action
  const terminalStatuses = ["completed", "failed", "dismissed"]
  if (terminalStatuses.includes(input.caseStatus)) {
    return {
      action: "no_action" as const,
      confidence: 1.0,
      reason: "Case is already in a terminal state — no recovery action needed.",
      factors: [
        `Case status: ${input.caseStatus}`,
        "Deterministic fallback — AI provider unavailable",
      ],
      riskLevel: "LOW" as const,
      customerIntent: "LOW",
      recommendedDelayMinutes: null,
      stopReason: "case_terminal",
    }
  }

  // Low recovery probability → no action
  if (input.recoveryProbability < FALLBACK_LOW_PROBABILITY_THRESHOLD) {
    return {
      action: "no_action" as const,
      confidence: 0.9,
      reason: `Recovery probability (${(input.recoveryProbability * 100).toFixed(0)}%) is below the fallback threshold — skipping recovery.`,
      factors: [
        `Recovery probability: ${(input.recoveryProbability * 100).toFixed(0)}% — below ${Math.round(FALLBACK_LOW_PROBABILITY_THRESHOLD * 100)}% threshold`,
        "AI provider unavailable — using conservative default of no action",
      ],
      riskLevel: "LOW",
      customerIntent: "LOW",
      recommendedDelayMinutes: null,
      stopReason: "low_probability_fallback",
    }
  }

  // Payment failure with good recovery probability → recommend retry (requires merchant approval)
  if (
    input.recoveryProbability >= 0.5 &&
    input.amountAtRisk > 0 &&
    input.category === "payment_failed" &&
    (input.priority === "high" || input.priority === "critical" || input.priority === "medium")
  ) {
    return {
      action: "retry_payment" as const,
      confidence: Math.min(input.recoveryProbability, 0.85),
      reason: `Payment failed with recoverable signal. \u20b9${(input.amountAtRisk / 100).toFixed(2)} at ${(input.recoveryProbability * 100).toFixed(0)}% recovery probability. Retrying payment is the most direct recovery path.`,
      factors: [
        `Category: payment_failed — retryable failure type`,
        `Recovery probability: ${(input.recoveryProbability * 100).toFixed(0)}%`,
        `Priority: ${input.priority}`,
        "Deterministic fallback — AI provider unavailable",
      ],
      riskLevel: "MEDIUM",
      customerIntent: "MEDIUM",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
  }

  // Checkout abandonment with moderate probability → send reminder (low-risk, auto-approved)
  if (
    input.recoveryProbability >= 0.5 &&
    input.amountAtRisk > 0 &&
    input.category === "checkout_abandoned"
  ) {
    return {
      action: "send_reminder" as const,
      confidence: Math.min(input.recoveryProbability * 0.9, 0.8),
      reason: `Cart abandonment with ${(input.recoveryProbability * 100).toFixed(0)}% recovery probability. Sending a reminder is a low-risk first step.`,
      factors: [
        `Category: checkout_abandoned`,
        `Recovery probability: ${(input.recoveryProbability * 100).toFixed(0)}%`,
        `Low-risk action: reminder only`,
      ],
      riskLevel: "LOW",
      customerIntent: "MEDIUM",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
  }

  // Critical priority + high probability → escalate to merchant
  if (
    input.recoveryProbability >= 0.5 &&
    input.amountAtRisk > 0 &&
    input.priority === "critical"
  ) {
    return {
      action: "escalate_to_merchant" as const,
      confidence: 0.6,
      reason: `Critical-priority case (\u20b9${(input.amountAtRisk / 100).toFixed(2)}) with ${(input.recoveryProbability * 100).toFixed(0)}% recovery probability. Escalating for human review because AI provider is unavailable.`,
      factors: [
        `Priority: critical — highest risk`,
        `Amount: \u20b9${(input.amountAtRisk / 100).toFixed(2)}`,
        `Recovery probability: ${(input.recoveryProbability * 100).toFixed(0)}%`,
        `AI provider unavailable — escalating for human review`,
      ],
      riskLevel: "LOW",
      customerIntent: "MEDIUM",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
  }

  // Default → no action
  return {
    action: "no_action" as const,
    confidence: 0.7,
    reason: "AI provider unavailable. Using safe default of no action for this case.",
    factors: [
      `Recovery probability: ${(input.recoveryProbability * 100).toFixed(0)}%`,
      `Priority: ${input.priority}`,
      "Deterministic fallback — conservative default",
    ],
    riskLevel: "LOW",
    customerIntent: "LOW",
    recommendedDelayMinutes: null,
    stopReason: "ai_unavailable_fallback",
  }
}

export { deterministicFallback } from "./fallback"