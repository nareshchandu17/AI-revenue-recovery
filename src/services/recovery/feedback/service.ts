/**
 * Intervention Feedback Loop (Feature 15)
 *
 * Records intervention outcomes and computes Bayesian-smoothed probability
 * estimates per action. These estimates can override or blend with
 * static priors in the probability estimator.
 */

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { logAudit } from '@/services/audit/log'
import type { InterventionOutcome } from '@prisma/client'
import {
  FEEDBACK_MODEL_VERSION,
  BAYESIAN_ALPHA,
  BAYESIAN_BETA,
  MIN_ESTABLISHED_TRIALS,
  FEEDBACK_SUCCESS_OUTCOMES,
  FEEDBACK_FAILURE_OUTCOMES,
  FEEDBACK_NON_INTERVENTION_OUTCOMES,
} from './types'
import type {
  FeedbackRecordInput,
  FeedbackStatsResult,
  FeedbackMetrics,
} from './types'

// ---------- helpers ---------------------------------------------------------

/**
 * Classify a customer into a value segment based on their total payment count.
 *   0 payments → 'new'
 *   1–4       → 'low'
 *   5–14      → 'normal'
 *   15–49     → 'high'
 *   50+       → 'very_high'
 */
function classifyCustomerValueSegment(paymentCount: number): string {
  if (paymentCount === 0) return 'new'
  if (paymentCount <= 4) return 'low'
  if (paymentCount <= 14) return 'normal'
  if (paymentCount <= 49) return 'high'
  return 'very_high'
}

// ---------- public API ------------------------------------------------------

/**
 * Record a feedback record from an intervention evaluation.
 *
 * Idempotent: if a feedback record already exists for the given evaluation,
 * returns null without creating a duplicate.
 *
 * Only RECOVERED and INEFFECTIVE outcomes qualify for feedback recording.
 * BLOCKED, CANCELLED, PREEMPTED, and UNKNOWN outcomes are non-interventions
 * or pending — no feedback record is created.
 */
export async function recordFeedbackFromEvaluation(
  evaluationId: string,
): Promise<FeedbackRecordInput | null> {
  // 1. Load the evaluation with its recovery attempt, case, and case's payment
  const evaluation = await db.interventionEvaluation.findUnique({
    where: { id: evaluationId },
    include: {
      recoveryAttempt: {
        include: {
          recoveryCase: {
            include: {
              payment: {
                select: {
                  customerId: true,
                  failureReason: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!evaluation) {
    logger.warn('Feedback recording skipped: evaluation not found', {
      attemptId: evaluationId,
    })
    return null
  }

  const attempt = evaluation.recoveryAttempt
  const recoveryCase = attempt.recoveryCase
  const payment = recoveryCase.payment

  // 2. Idempotency check — already recorded?
  const existing = await db.interventionFeedbackRecord.findUnique({
    where: { interventionEvaluationId: evaluationId },
  })
  if (existing) {
    logger.info('Feedback already recorded, skipping', {
      attemptId: attempt.id,
      evaluationId,
    })
    return null
  }

  const outcome = evaluation.outcome as string

  // 3. Non-intervention outcomes don't qualify for feedback
  if (FEEDBACK_NON_INTERVENTION_OUTCOMES.has(outcome)) {
    return null
  }

  // 4. Only RECOVERED and INEFFECTIVE are valid feedback outcomes
  if (!FEEDBACK_SUCCESS_OUTCOMES.has(outcome) && !FEEDBACK_FAILURE_OUTCOMES.has(outcome)) {
    return null
  }

  const merchantId = recoveryCase.merchantId
  const action = attempt.action

  // 5. Determine customer value segment
  const customerId = payment?.customerId ?? ''
  let customerValueSegment = 'unknown'

  if (customerId) {
    const paymentCount = await db.payment.count({
      where: { customerId, merchantId },
    })
    customerValueSegment = classifyCustomerValueSegment(paymentCount)
  }

  // 6. Check for active anomaly
  const anomalyActive = (await db.riskAnomaly.count({
    where: { merchantId, status: 'active' },
  })) > 0

  // 7. Build record input
  const recoveredAmount =
    outcome === 'RECOVERED' ? attempt.recoveredAmount : 0
  const eligibleAmount = recoveryCase.amountAtRisk
  const failureReason = payment?.failureReason ?? ''

  const recordData: Omit<FeedbackRecordInput, 'merchantId'> & { merchantId: string } = {
    merchantId,
    recoveryCaseId: recoveryCase.id,
    recoveryAttemptId: attempt.id,
    interventionEvaluationId: evaluation.id,
    action,
    outcome,
    recoveredAmount,
    eligibleAmount,
    customerValueSegment,
    failureReason,
    anomalyActive,
  }

  // 8. Create the feedback record
  await db.interventionFeedbackRecord.create({
    data: {
      merchantId: recordData.merchantId,
      recoveryCaseId: recordData.recoveryCaseId,
      recoveryAttemptId: recordData.recoveryAttemptId,
      interventionEvaluationId: recordData.interventionEvaluationId,
      action: recordData.action,
      outcome: recordData.outcome as InterventionOutcome,
      recoveredAmount: recordData.recoveredAmount,
      eligibleAmount: recordData.eligibleAmount,
      customerValueSegment: recordData.customerValueSegment,
      failureReason: recordData.failureReason,
      anomalyActive: recordData.anomalyActive,
      feedbackModelVersion: FEEDBACK_MODEL_VERSION,
    },
  })

  // 9. Update aggregated stats
  await updateFeedbackStats(merchantId, action)

  // 10. Audit trail
  await logAudit({
    actor: { type: 'system' },
    eventType: 'FEEDBACK_RECORDED',
    entityType: 'InterventionFeedbackRecord',
    entityId: evaluation.id,
    action: 'FEEDBACK_RECORDED',
    details: `Recorded ${outcome} outcome for action=${action}, segment=${customerValueSegment}, amount=${recoveredAmount}p`,
    metadata: {
      merchantId,
      recoveryCaseId: recoveryCase.id,
      recoveryAttemptId: attempt.id,
      action,
      outcome,
      recoveredAmount,
      eligibleAmount,
      customerValueSegment,
      anomalyActive,
    },
  })

  logger.info('Feedback recorded', {
    merchantId,
    caseId: recoveryCase.id,
    attemptId: attempt.id,
    action,
    outcome,
  })

  return recordData
}

/**
 * Recompute and upsert aggregated feedback statistics for a
 * merchant+action combination.
 *
 * Uses Bayesian (Beta-Binomial) smoothing:
 *   P = (successCount + α) / (trialCount + α + β)
 *
 * Confidence scales linearly from 0.3 (0 trials) to 0.95 (50+ trials).
 */
export async function updateFeedbackStats(
  merchantId: string,
  action: string,
): Promise<void> {
  // 1. Aggregate all feedback records for this merchant+action
  const aggregation = await db.interventionFeedbackRecord.aggregate({
    where: {
      merchantId,
      action,
      feedbackModelVersion: FEEDBACK_MODEL_VERSION,
    },
    _count: true,
    _sum: {
      recoveredAmount: true,
      eligibleAmount: true,
    },
  })

  // Count successes (RECOVERED outcomes)
  const successCount = await db.interventionFeedbackRecord.count({
    where: {
      merchantId,
      action,
      feedbackModelVersion: FEEDBACK_MODEL_VERSION,
      outcome: 'RECOVERED' as InterventionOutcome,
    },
  })

  const trialCount = aggregation._count
  const totalRecovered = aggregation._sum.recoveredAmount ?? 0
  const totalEligible = aggregation._sum.eligibleAmount ?? 0

  // 2. Compute Bayesian smoothed probability
  const smoothedProbability =
    (successCount + BAYESIAN_ALPHA) /
    (trialCount + BAYESIAN_ALPHA + BAYESIAN_BETA)

  // 3. Compute confidence: min(0.95, 0.3 + (trialCount / 50) * 0.65)
  const confidence = Math.min(0.95, 0.3 + (trialCount / 50) * 0.65)

  // 4. Upsert stats (unique on merchantId + action + feedbackModelVersion)
  await db.interventionFeedbackStats.upsert({
    where: {
      merchantId_action_feedbackModelVersion: {
        merchantId,
        action,
        feedbackModelVersion: FEEDBACK_MODEL_VERSION,
      },
    },
    create: {
      merchantId,
      action,
      successCount,
      trialCount,
      recoveredAmount: totalRecovered,
      eligibleAmount: totalEligible,
      smoothedProbability,
      confidence,
      feedbackModelVersion: FEEDBACK_MODEL_VERSION,
    },
    update: {
      successCount,
      trialCount,
      recoveredAmount: totalRecovered,
      eligibleAmount: totalEligible,
      smoothedProbability,
      confidence,
    },
  })

  // 5. Audit — log when trial count changes (not on every read)
  await logAudit({
    actor: { type: 'system' },
    eventType: 'INTERVENTION_STATISTICS_UPDATED',
    entityType: 'InterventionFeedbackStats',
    entityId: `${merchantId}:${action}`,
    action: 'STATISTICS_UPDATED',
    details: `Updated stats for action=${action}: trials=${trialCount}, successes=${successCount}, smoothed=${smoothedProbability.toFixed(4)}`,
    metadata: {
      merchantId,
      action,
      successCount,
      trialCount,
      recoveredAmount: totalRecovered,
      eligibleAmount: totalEligible,
      smoothedProbability,
      confidence,
      feedbackModelVersion: FEEDBACK_MODEL_VERSION,
    },
  })
}

/**
 * Get feedback statistics for a specific action on a merchant.
 * Returns null if no stats exist (cold start — no data).
 */
export async function getFeedbackStatsForAction(
  merchantId: string,
  action: string,
): Promise<FeedbackStatsResult | null> {
  const stats = await db.interventionFeedbackStats.findUnique({
    where: {
      merchantId_action_feedbackModelVersion: {
        merchantId,
        action,
        feedbackModelVersion: FEEDBACK_MODEL_VERSION,
      },
    },
  })

  if (!stats) {
    return null
  }

  return {
    action: stats.action,
    successCount: stats.successCount,
    trialCount: stats.trialCount,
    recoveredAmount: stats.recoveredAmount,
    eligibleAmount: stats.eligibleAmount,
    smoothedProbability: stats.smoothedProbability,
    confidence: stats.confidence,
    feedbackModelVersion: stats.feedbackModelVersion,
    sampleSize: stats.trialCount,
    isColdStart: stats.trialCount < MIN_ESTABLISHED_TRIALS,
  }
}

/**
 * Get a feedback-adjusted prior probability for a given action.
 *
 * Three regimes:
 * 1. Cold start (no stats)        → return configuredBase with source='prior'
 * 2. Insufficient trials          → blend configuredBase and feedback (linear interpolation)
 * 3. Established (enough trials)  → return feedback probability directly
 */
export async function getFeedbackAdjustedPrior(
  merchantId: string,
  action: string,
  configuredBase: number,
): Promise<
  | { probability: number; source: 'feedback' | 'prior'; sampleSize: number }
  | { probability: number; source: 'blended'; sampleSize: number }
> {
  const stats = await getFeedbackStatsForAction(merchantId, action)

  // Cold start — no data at all
  if (!stats) {
    return { probability: configuredBase, source: 'prior', sampleSize: 0 }
  }

  // Insufficient trials — blend
  if (stats.trialCount < MIN_ESTABLISHED_TRIALS) {
    const weight = stats.trialCount / MIN_ESTABLISHED_TRIALS // 0 to 1
    const blended =
      configuredBase * (1 - weight) + stats.smoothedProbability * weight
    return { probability: blended, source: 'blended', sampleSize: stats.trialCount }
  }

  // Established — use feedback directly
  return {
    probability: stats.smoothedProbability,
    source: 'feedback',
    sampleSize: stats.trialCount,
  }
}

/**
 * Get comprehensive feedback metrics for a merchant.
 * Includes coverage, per-action stats, and overall smoothed rate.
 */
export async function getFeedbackMetrics(
  merchantId: string,
): Promise<FeedbackMetrics> {
  // 1. Count total evaluated interventions for this merchant
  const totalEvaluatedInterventions = await db.interventionEvaluation.count({
    where: {
      recoveryCase: { merchantId },
    },
  })

  // 2. Count pending (UNKNOWN) outcomes
  const totalPendingOutcomes = await db.interventionEvaluation.count({
    where: {
      recoveryCase: { merchantId },
      outcome: 'UNKNOWN' as InterventionOutcome,
    },
  })

  // 3. Count feedback-eligible evaluations (RECOVERED + INEFFECTIVE)
  const feedbackEligible = await db.interventionEvaluation.count({
    where: {
      recoveryCase: { merchantId },
      outcome: {
        in: ['RECOVERED', 'INEFFECTIVE'] as InterventionOutcome[],
      },
    },
  })

  // 4. Count feedback-recorded
  const feedbackRecorded = await db.interventionFeedbackRecord.count({
    where: { merchantId },
  })

  // 5. Compute coverage
  const feedbackCoverage =
    feedbackEligible > 0 ? feedbackRecorded / feedbackEligible : null

  // 6. Get all stats for this merchant
  const allStats = await db.interventionFeedbackStats.findMany({
    where: { merchantId, feedbackModelVersion: FEEDBACK_MODEL_VERSION },
  })

  // 7. Build per-action map
  const byAction: Record<string, FeedbackStatsResult> = {}
  for (const stat of allStats) {
    byAction[stat.action] = {
      action: stat.action,
      successCount: stat.successCount,
      trialCount: stat.trialCount,
      recoveredAmount: stat.recoveredAmount,
      eligibleAmount: stat.eligibleAmount,
      smoothedProbability: stat.smoothedProbability,
      confidence: stat.confidence,
      feedbackModelVersion: stat.feedbackModelVersion,
      sampleSize: stat.trialCount,
      isColdStart: stat.trialCount < MIN_ESTABLISHED_TRIALS,
    }
  }

  // 8. Compute overall smoothed rate weighted by trial count
  let totalTrials = 0
  let weightedSum = 0
  for (const stat of allStats) {
    weightedSum += stat.smoothedProbability * stat.trialCount
    totalTrials += stat.trialCount
  }
  const overallSmoothedRate =
    totalTrials > 0 ? weightedSum / totalTrials : null

  return {
    totalEvaluatedInterventions,
    totalPendingOutcomes,
    feedbackCoverage,
    byAction,
    overallSmoothedRate,
  }
}
