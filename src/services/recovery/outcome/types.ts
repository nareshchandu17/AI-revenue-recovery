/**
 * Intervention Outcome Evaluation — Type Definitions (Feature 7)
 *
 * Definitions:
 *
 *   RECOVERED  — Attempt was executed AND verified attribution exists linking
 *                revenue to this specific attempt.
 *   INEFFECTIVE — Attempt was executed (succeeded or failed) but no attribution
 *                exists and sufficient time has passed since execution.
 *   BLOCKED   — Attempt was blocked before execution (DND, contact limit, policy).
 *                NOT counted as an intervention.
 *   CANCELLED — Attempt was cancelled before execution.
 *                NOT counted as an intervention.
 *   PREEMPTED — Payment was captured before the attempt could execute.
 *                NOT counted as an intervention.
 *   UNKNOWN   — Attempt was executed recently; insufficient time has passed
 *                to determine outcome.
 *
 * Key Distinction — False vs Ineffective:
 *   - INEFFECTIVE = we tried, it didn't work. Data supports this.
 *   - FALSE = we tried, but it was unnecessary (customer would have paid anyway).
 *     This requires causal reasoning the available data CANNOT reliably support.
 *     Therefore, False Intervention Rate = NOT CAUSALLY MEASURABLE.
 *
 * Defensible Metric — Ineffective Intervention Rate:
 *   = INEFFECTIVE / (RECOVERED + INEFFECTIVE + UNKNOWN)
 *   Denominator: all EXECUTED interventions (succeeded + failed attempts).
 *   Excludes: blocked, cancelled, preempted, pending, queued, running.
 */

import type { InterventionOutcome } from '@prisma/client'

/** Current evaluation logic version. */
export const EVALUATION_VERSION = '1.0.0'

/** Minimum hours after execution before classifying as INEFFECTIVE. */
export const INEFFECTIVE_WINDOW_HOURS = 48

/** Actions that are customer-facing (eligible for outcome evaluation). */
export const EVALUABLE_ACTIONS = new Set([
  'send_reminder',
  'payment_link',
  'retry_payment',
  'offer_discount',
  'escalate_to_merchant',
])

/** Terminal attempt statuses that count as "executed". */
export const EXECUTED_STATUSES = new Set(['succeeded', 'failed'])

/** Non-intervention statuses (NOT counted in any rate denominator). */
export const NON_INTERVENTION_STATUSES = new Set(['blocked', 'cancelled', 'pending', 'queued', 'running'])

export interface EvaluationResult {
  attemptId: string
  caseId: string
  action: string
  outcome: InterventionOutcome
  classificationReason: string
  evaluationVersion: string
  evaluatedAt: Date
}

/** Per-action effectiveness metrics. */
export interface ActionEffectiveness {
  action: string
  executed: number
  recovered: number
  ineffective: number
  blocked: number
  cancelled: number
  preempted: number
  unknown: number
  recoveredRevenue: number
  successRate: number | null
  ineffectiveRate: number | null
  falseInterventionRate: 'NOT_CAUSALLY_MEASURABLE'
}

/** Aggregate intervention effectiveness metrics. */
export interface InterventionEffectivenessMetrics {
  totalExecuted: number
  totalRecovered: number
  totalIneffective: number
  totalBlocked: number
  totalCancelled: number
  totalPreempted: number
  totalUnknown: number
  totalRecoveredRevenue: number
  interventionSuccessRate: number | null
  ineffectiveInterventionRate: number | null
  falseInterventionRate: 'NOT_CAUSALLY_MEASURABLE'
  evaluationVersion: string
  byAction: Record<string, ActionEffectiveness>
  /** Breakdown by recovery probability band (if CLV/probability data available). */
  byProbabilityBand: Record<string, { executed: number; recovered: number; ineffective: number }>
  /** Breakdown by priority. */
  byPriority: Record<string, { executed: number; recovered: number; ineffective: number }>
}
