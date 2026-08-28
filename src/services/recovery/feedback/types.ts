/**
 * Intervention Feedback Loop (Feature 15)
 *
 * Types, constants, and interfaces for the outcome feedback system.
 * Uses Bayesian (Beta-Binomial) smoothing to produce stable probability
 * estimates even with small sample sizes.
 */

// Current version of the feedback model.
// Bumping this creates fresh statistics — old versions are preserved.
export const FEEDBACK_MODEL_VERSION = '1.0.0'

// Beta-Binomial Bayesian smoothing parameters.
// These represent the strength of the prior belief.
// alpha = prior successes + 1 (we start optimistic with alpha=2, beta=3)
// interpretation: before seeing any data, we assume ~40% success rate (alpha/(alpha+beta) = 2/5)
export const BAYESIAN_ALPHA = 2
export const BAYESIAN_BETA = 3

// Minimum sample size for segment-level estimates.
// Below this, fall back to intervention-level or global prior.
export const SEGMENT_MIN_SAMPLE = 15

// Minimum trial count before feedback statistics are considered 'established'
export const MIN_ESTABLISHED_TRIALS = 5

// Outcomes that count as 'recovery' (success) for feedback purposes.
// BLOCKED/CANCELLED are NOT interventions — excluded from trial count.
// PREEMPTED is NOT an intervention failure — excluded from trial count.
export const FEEDBACK_SUCCESS_OUTCOMES = new Set(['RECOVERED'])
export const FEEDBACK_FAILURE_OUTCOMES = new Set(['INEFFECTIVE'])
export const FEEDBACK_NON_INTERVENTION_OUTCOMES = new Set([
  'BLOCKED',
  'CANCELLED',
  'PREEMPTED',
  'UNKNOWN',
])

export interface FeedbackRecordInput {
  merchantId: string
  recoveryCaseId: string
  recoveryAttemptId: string
  interventionEvaluationId: string
  action: string
  outcome: string
  recoveredAmount: number
  eligibleAmount: number
  customerValueSegment: string
  failureReason: string
  anomalyActive: boolean
}

export interface FeedbackStatsResult {
  action: string
  successCount: number
  trialCount: number
  recoveredAmount: number
  eligibleAmount: number
  smoothedProbability: number
  confidence: number
  feedbackModelVersion: string
  sampleSize: number
  isColdStart: boolean
}

export interface FeedbackMetrics {
  totalEvaluatedInterventions: number
  totalPendingOutcomes: number // UNKNOWN outcomes
  feedbackCoverage: number | null
  byAction: Record<string, FeedbackStatsResult>
  overallSmoothedRate: number | null
}
