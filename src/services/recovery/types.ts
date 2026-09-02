/**
 * Recovery engine type definitions.
 *
 * These types define the bounded recovery workflow.
 * Concrete implementations come in future tasks.
 */

/** What kind of revenue risk was detected. */
export type RiskCategory =
  | "payment_failed"
  | "payment_expired"
  | "checkout_abandoned"
  | "subscription_lapsed"
  | "refund_requested"
  | "other"

/** Severity used to prioritise recovery attempts. */
export type RiskSeverity = "low" | "medium" | "high" | "critical"

/** Lifecycle stages of a recovery case. */
export type RecoveryCaseStatus =
  | "detected"
  | "diagnosing"
  | "diagnosed"
  | "awaiting_approval"
  | "executing"
  | "completed"
  | "failed"
  | "dismissed"

/** Actions the AI agent may recommend. */
export type RecoveryAction =
  | "retry_payment"
  | "send_reminder"
  | "offer_discount"
  | "update_payment_method"
  | "cancel_and_refund"
  | "escalate_to_merchant"
  | "no_action"

/** Structured output expected from the AI diagnosis step. */
export interface Diagnosis {
  cause: string
  confidence: number // 0-1
  recommendedAction: RecoveryAction
  reasoning: string
  recoveryProbability: number // 0-1
}
