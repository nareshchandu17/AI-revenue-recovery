/**
 * Per-Intervention Recovery Probability types.
 *
 * Key distinction:
 *   baselineRecoveryProbability = P(recover | case, NO intervention)
 *   interventionProbability     = P(recover | case, specific action)
 *
 * The baseline represents organic recovery (customer pays on their own).
 * Intervention probability is conditional on performing the action.
 */

import type { AgentAction } from "../agent/types"

/** A single explainability factor for a probability estimate. */
export interface ProbabilityFactor {
  signal: string
  direction: "positive" | "negative" | "neutral"
  detail: string
}

/** A single probability estimate for one intervention. */
export interface InterventionProbability {
  action: string
  /** 0.0 to 1.0 */
  probability: number
  /** 0.0 to 1.0 */
  confidence: number
  factors: ProbabilityFactor[]
  modelVersion: string
}

/** Full probability assessment for a recovery case. */
export interface ProbabilityAssessment {
  recoveryCaseId: string
  /** Baseline: P(recover | case, no intervention) */
  baseline: InterventionProbability
  /** Per-intervention: P(recover | case, action_i) */
  interventions: InterventionProbability[]
  modelVersion: string
  computedAt: string
}

/** Signals available to the probability model. */
export interface ProbabilitySignals {
  // Case signals
  amountAtRisk: number
  category: string
  priority: string
  ageHours: number
  existingRecoveryScore: number
  // Customer signals
  customerSuccessRate: number
  customerSuccessfulPayments: number
  customerFailedPayments: number
  customerHistoricalSpend: number
  customerAvgTransactionValue: number
  customerLastSuccessHoursAgo: number | null
  customerValueWeight: number
  // Payment signals
  failureCode: string
  failureReason: string
  paymentMethod: string | null
  // Recovery history signals
  previousAttemptCount: number
  previousAttemptActions: string[]
  previousAttemptSuccessCount: number
  // Feature 15: Feedback-adjusted priors (optional — populated from DB)
  // Maps action → { probability, source, sampleSize }
  // If not provided, the estimator falls back to configured static priors.
  feedbackAdjustedPriors?: Record<string, { probability: number; source: string; sampleSize: number }>
}

/** Model version for the current estimator. */
export const CURRENT_MODEL_VERSION = "1.0.0"