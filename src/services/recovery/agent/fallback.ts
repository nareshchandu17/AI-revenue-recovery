/**
 * Deterministic fallback when the AI provider is unavailable.
 *
 * Safety-first: the fallback NEVER automatically executes a payment action.
 * It either does nothing or escalates to a human.
 */

import type { AIDecisionOutput, AgentAction } from "./types"

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
 * - High probability + eligible case → escalate_to_merchant (never auto-execute)
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

  // High probability eligible case → escalate (safest active action)
  if (
    input.recoveryProbability >= 0.5 &&
    input.amountAtRisk > 0 &&
    (input.priority === "high" || input.priority === "critical")
  ) {
    return {
      action: "escalate_to_merchant",
      confidence: 0.6,
      reason: `High-priority case (₹${(input.amountAtRisk / 100).toFixed(2)}, ${input.priority}) with ${  (input.recoveryProbability * 100).toFixed(0)  }% recovery probability. Escalating to merchant because AI provider is unavailable.`,
      factors: [
        `Priority: ${input.priority}`,
        `Amount: ₹${(input.amountAtRisk / 100).toFixed(2)}`,
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
      "AI provider unavailable — conservative fallback",
    ],
    riskLevel: "LOW",
    customerIntent: "LOW",
    recommendedDelayMinutes: null,
    stopReason: "ai_unavailable_fallback",
  }
}
