/**
 * Merchant policy configuration and guardrail validation.
 *
 * The AI recommends. Policy decides.
 *
 * This layer runs AFTER the AI produces a decision.
 * It enforces deterministic business rules that the AI cannot override.
 */

import { OPEN_CASE_STATUSES, TERMINAL_CASE_STATUSES } from "../detection/constants"
import type { AgentAction, AIDecisionOutput, MerchantPolicy, PolicyResult } from "./types"

// --- Default Policy --------------------------------------------------------

/** Safe default policy. Can be overridden per-merchant later. */
export const DEFAULT_MERCHANT_POLICY: MerchantPolicy = {
  maxRecoveryAttempts: 3,
  minimumRecoveryAmount: 100, // ₹1.00 — below this, not worth recovering
  maximumRecoveryAmountForAutomation: 1000000, // ₹10,000 — above requires manual approval
  allowedActions: [
    "no_action",
    "retry_payment",
    "send_reminder",
    "update_payment_method",
    "escalate_to_merchant",
  ],
  minimumRecoveryProbability: 0.1, // 10% minimum recovery probability
  minimumConfidence: 0.3, // 30% minimum AI confidence to auto-approve
  retryCooldownMinutes: 30,
}

// --- Guardrail Validation --------------------------------------------------

export interface PolicyValidationInput {
  aiDecision: AIDecisionOutput
  policy: MerchantPolicy
  caseStatus: string
  amountAtRisk: number
  recoveryProbability: number
  existingAttemptCount: number
  lastAttemptAt: Date | null
}

/**
 * Run policy guardrails against the AI recommendation.
 *
 * The policy is authoritative. If it rejects the AI recommendation,
 * the final action is overridden to no_action or escalate_to_merchant.
 */
export function validatePolicy(input: PolicyValidationInput): PolicyResult {
  const violations: string[] = []
  const { aiDecision, policy, caseStatus, amountAtRisk, recoveryProbability, existingAttemptCount, lastAttemptAt } = input

  // 1. Case must be in an open (active) state
  if ((TERMINAL_CASE_STATUSES as readonly string[]).includes(caseStatus)) {
    violations.push(
      `Case is in terminal state "${caseStatus}" — no action allowed`
    )
    return buildRejection(aiDecision.action, violations)
  }

  // 2. Action must be in the allowed set
  if (!policy.allowedActions.includes(aiDecision.action)) {
    violations.push(
      `Action "${aiDecision.action}" is not in the merchant's allowed actions`
    )
  }

  // 3. Amount must meet minimum
  if (amountAtRisk < policy.minimumRecoveryAmount) {
    violations.push(
      `Amount ₹${(amountAtRisk / 100).toFixed(2)} is below minimum recovery amount ₹${(policy.minimumRecoveryAmount / 100).toFixed(2)}`
    )
  }

  // 4. Recovery probability must meet minimum
  if (recoveryProbability < policy.minimumRecoveryProbability) {
    violations.push(
      `Recovery probability ${(recoveryProbability * 100).toFixed(0)}% is below minimum ${(policy.minimumRecoveryProbability * 100).toFixed(0)}%`
    )
  }

  // 5. Confidence must meet minimum (for actions other than no_action/escalate)
  if (
    aiDecision.action !== "no_action" &&
    aiDecision.action !== "escalate_to_merchant" &&
    aiDecision.confidence < policy.minimumConfidence
  ) {
    violations.push(
      `Confidence ${(aiDecision.confidence * 100).toFixed(0)}% is below minimum ${(policy.minimumConfidence * 100).toFixed(0)}% for action "${aiDecision.action}"`
    )
  }

  // 6. Retry limit check
  if (
    aiDecision.action === "retry_payment" &&
    existingAttemptCount >= policy.maxRecoveryAttempts
  ) {
    violations.push(
      `Retry limit reached (${existingAttemptCount}/${policy.maxRecoveryAttempts})`
    )
  }

  // 7. Retry cooldown check
  if (
    (aiDecision.action === "retry_payment" || aiDecision.action === "send_reminder") &&
    lastAttemptAt &&
    policy.retryCooldownMinutes > 0
  ) {
    const elapsed = (Date.now() - lastAttemptAt.getTime()) / 60_000
    if (elapsed < policy.retryCooldownMinutes) {
      violations.push(
        `Cooldown active: ${(policy.retryCooldownMinutes - elapsed).toFixed(0)} minutes remaining`
      )
    }
  }

  // 8. High-value amount requires escalation (not automated retry)
  if (
    (aiDecision.action === "retry_payment" || aiDecision.action === "send_reminder") &&
    amountAtRisk > policy.maximumRecoveryAmountForAutomation
  ) {
    violations.push(
      `Amount ₹${(amountAtRisk / 100).toFixed(2)} exceeds automation limit ₹${(policy.maximumRecoveryAmountForAutomation / 100).toFixed(2)} — requires escalation`
    )
  }

  // No violations → approve
  if (violations.length === 0) {
    return {
      allowed: true,
      finalAction: aiDecision.action,
      rejectionReason: null,
      policyViolations: [],
    }
  }

  // Violations exist → determine safe override
  return buildRejection(aiDecision.action, violations)
}

/**
 * Build a rejection PolicyResult.
 * If the AI recommended a retry-like action, downgrade to send_reminder or no_action.
 * High-value cases always escalate rather than silently dropping.
 */
function buildRejection(
  recommendedAction: AgentAction,
  violations: string[]
): PolicyResult {
  // If AI wanted to do something active, check if escalation is appropriate
  const isActiveAction = recommendedAction !== "no_action"

  // Use escalate_to_merchant if the AI recommended an active action
  // (a human should review). Otherwise no_action.
  const finalAction: AgentAction = isActiveAction
    ? "escalate_to_merchant"
    : "no_action"

  return {
    allowed: false,
    finalAction,
    rejectionReason: violations.join("; "),
    policyViolations: violations,
  }
}
