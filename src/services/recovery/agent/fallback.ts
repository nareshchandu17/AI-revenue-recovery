/**
 * Deterministic fallback when the AI provider is unavailable.
 * Safety-first: the fallback is context-aware but conservative.
 * Payment retries require merchant approval (handled by the agent pipeline).
 */

import { logger } from "@/lib/logger"
import type { AIDecisionOutput } from "./types"

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
 * Build a safe FallbackInput with defaults for any missing field.
 */
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
 * Build a safe AIDecisionOutput with conservative defaults.
 */
function toAIDecisionOutput(reason: string, factors: string[], extra?: Partial<AIDecisionOutput>): AIDecisionOutput {
  return {
    action: "no_action",
    confidence: 1.0,
    reason,
    factors,
    riskLevel: "LOW",
    customerIntent: "LOW",
    recommendedDelayMinutes: null,
    stopReason: "ai_unavailable_fallback",
    discountPercent: null,
    ...extra,
  }
}

/**
 * Deterministic fallback when the AI provider is unavailable.
 * Returns a conservative decision based on case signals.
 */
export function deterministicFallback(
  input: FallbackInput
): AIDecisionOutput {
  const safe = safeFallbackInput(input)

  // Terminal cases → no action
  const terminalStatuses = ["completed", "failed", "dismissed"]
  if (terminalStatuses.includes(safe.caseStatus)) {
    return toAIDecisionOutput(
      "Case is already in a terminal state — no recovery action needed. AI provider is unavailable.",
      [`Case status: ${safe.caseStatus}`, "Deterministic fallback — AI provider is unavailable"],
      { stopReason: "case_terminal" }
    )
  }

  // Low recovery probability → no action
  if (safe.recoveryProbability < FALLBACK_LOW_PROBABILITY_THRESHOLD) {
    return toAIDecisionOutput(
      `Recovery probability (${(safe.recoveryProbability * 100).toFixed(0)}%) is below the fallback threshold — skipping recovery.`,
      [
        `Recovery probability: ${(safe.recoveryProbability * 100).toFixed(0)}% — below ${Math.round(FALLBACK_LOW_PROBABILITY_THRESHOLD * 100)}% threshold`,
        "AI provider unavailable — using conservative default of no action",
      ],
      { confidence: 0.9, stopReason: "low_probability_fallback" }
    )
  }

  // Payment failure with good recovery probability → recommend retry (requires merchant approval)
  if (
    safe.recoveryProbability >= 0.5 &&
    safe.amountAtRisk > 0 &&
    safe.category === "payment_failed" &&
    (safe.priority === "medium")
  ) {
    return toAIDecisionOutput(
      `Payment failed with recoverable signal. ₹${(safe.amountAtRisk / 100).toFixed(2)} at ${(safe.recoveryProbability * 100).toFixed(0)}% recovery probability. Retrying payment is the most direct recovery path.`,
      [
        `Category: payment_failed — retryable failure type`,
        `Recovery probability: ${(safe.recoveryProbability * 100).toFixed(0)}%`,
        `Priority: ${safe.priority}`,
        "Deterministic fallback — AI provider unavailable",
      ],
      {
        action: "retry_payment",
        confidence: Math.min(safe.recoveryProbability, 0.85),
        riskLevel: "MEDIUM",
        customerIntent: "MEDIUM",
        stopReason: null,
      }
    )
  }

  // Checkout abandonment with moderate probability → send reminder (low-risk, auto-approved)
  if (
    safe.recoveryProbability >= 0.5 &&
    safe.amountAtRisk > 0 &&
    safe.category === "checkout_abandoned"
  ) {
    return toAIDecisionOutput(
      `Cart abandonment with ${(safe.recoveryProbability * 100).toFixed(0)}% recovery probability. Sending a reminder is a low-risk first step.`,
      [
        `Category: checkout_abandoned`,
        `Recovery probability: ${(safe.recoveryProbability * 100).toFixed(0)}%`,
        `Low-risk action: reminder only`,
      ],
      {
        action: "send_reminder",
        confidence: Math.min(safe.recoveryProbability * 0.9, 0.8),
        riskLevel: "LOW",
        customerIntent: "MEDIUM",
        stopReason: null,
      }
    )
  }

  // Critical or high priority + high probability → escalate to merchant
  if (
    safe.recoveryProbability >= 0.5 &&
    safe.amountAtRisk > 0 &&
    (safe.priority === "critical" || safe.priority === "high")
  ) {
    return toAIDecisionOutput(
      `High/critical-priority case (₹${(safe.amountAtRisk / 100).toFixed(2)}) with ${(safe.recoveryProbability * 100).toFixed(0)}% recovery probability. Escalating for human review because AI provider is unavailable.`,
      [
        `Priority: ${safe.priority} — high risk`,
        `Amount: ₹${(safe.amountAtRisk / 100).toFixed(2)}`,
        `Recovery probability: ${(safe.recoveryProbability * 100).toFixed(0)}%`,
        `AI provider is unavailable — escalating for human review`,
      ],
      {
        action: "escalate_to_merchant",
        confidence: 0.6,
        riskLevel: "LOW",
        customerIntent: "MEDIUM",
        stopReason: null,
      }
    )
  }

  // Default → no action
  return toAIDecisionOutput(
    "AI provider unavailable. Using safe default of no action for this case.",
    [
      `Recovery probability: ${(safe.recoveryProbability * 100).toFixed(0)}%`,
      `Priority: ${safe.priority}`,
      "Deterministic fallback — conservative default",
    ]
  )
}
