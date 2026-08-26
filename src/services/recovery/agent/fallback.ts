/**
 * Deterministic fallback when the AI provider is unavailable.
 *
 * Safety-first: the fallback is context-aware but conservative.
 * Payment retries require merchant approval (handled by the agent pipeline).
 */

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
 * Produce a safe deterministic decision when AI is unavailable.
 *
 * Rules:
 * - Terminal/resolved case → no_action
 * - Very low recovery probability → no_action
 * - Payment failure + good recovery probability → retry_payment (requires merchant approval)
 * - Checkout abandonment + moderate probability → send_reminder (auto-approved, low risk)
 * - Critical priority + high probability → escalate_to_merchant
 * - Everything else → no_action
 */
export function deterministicFallback(input: FallbackInput): AIDecisionOutput {
  // Terminal cases → no action
  const terminalStatuses = ["completed", "failed", "dismissed"]
  if (terminalStatuses.includes(input.caseStatus)) {
    return {
      action: "no_action",
      confidence: 1.0,
      reason: "Case is already in a terminal state — no recovery action needed.",
      factors: ["Case status: " + input.caseStatus],
      riskLevel: "LOW",
      customerIntent: "LOW",
      recommendedDelayMinutes: null,
      stopReason: "case_terminal",
    }
  }

  // Low recovery probability → no action
  if (input.recoveryProbability < FALLBACK_LOW_PROBABILITY_THRESHOLD) {
    return {
      action: "no_action",
      confidence: 0.9,
      reason: `Recovery probability (${(input.recoveryProbability * 100).toFixed(0)}%) is below the fallback threshold — skipping recovery.`,
      factors: [
        `Recovery probability: ${(input.recoveryProbability * 100).toFixed(0)}%`,
        "AI provider unavailable — using conservative fallback",
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
      action: "retry_payment",
      confidence: Math.min(input.recoveryProbability, 0.85),
      reason: `Payment failed with recoverable signal. \u20b9${(input.amountAtRisk / 100).toFixed(2)} at ${(input.recoveryProbability * 100).toFixed(0)}% recovery probability. Retrying payment is the most direct recovery path.`,
      factors: [
        `Category: payment_failed — retryable failure type`,
        `Recovery probability: ${(input.recoveryProbability * 100).toFixed(0)}%`,
        `Amount: \u20b9${(input.amountAtRisk / 100).toFixed(2)}`,
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
      action: "send_reminder",
      confidence: Math.min(input.recoveryProbability * 0.9, 0.8),
      reason: `Cart abandonment with ${(input.recoveryProbability * 100).toFixed(0)}% recovery probability. Sending a reminder is a low-risk first step.`,
      factors: [
        `Category: checkout_abandoned`,
        `Recovery probability: ${(input.recoveryProbability * 100).toFixed(0)}%`,
        "Low-risk action: reminder only",
        "Deterministic fallback — AI provider unavailable",
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
      action: "escalate_to_merchant",
      confidence: 0.6,
      reason: `Critical-priority case (\u20b9${(input.amountAtRisk / 100).toFixed(2)}) with ${(input.recoveryProbability * 100).toFixed(0)}% recovery probability. Escalating to merchant because AI provider is unavailable.`,
      factors: [
        `Priority: critical — highest risk`,
        `Amount: \u20b9${(input.amountAtRisk / 100).toFixed(2)}`,
        `Recovery probability: ${(input.recoveryProbability * 100).toFixed(0)}%`,
        "AI provider unavailable — escalating for human review",
      ],
      riskLevel: "LOW",
      customerIntent: "MEDIUM",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
  }

  // Default → no action
  return {
    action: "no_action",
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
