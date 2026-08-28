/**
 * Intervention Effectiveness Metrics (Feature 7)
 *
 * Computes aggregate metrics from persisted InterventionEvaluation records.
 * All metrics are derived from actual persisted events — no fake counters.
 *
 * Formulas:
 *   Executed interventions = attempts with status in {succeeded, failed}
 *   Intervention Success Rate = RECOVERED / (RECOVERED + INEFFECTIVE + UNKNOWN)
 *     - null if denominator is 0
 *   Ineffective Intervention Rate = INEFFECTIVE / (RECOVERED + INEFFECTIVE + UNKNOWN)
 *     - null if denominator is 0
 *   False Intervention Rate = NOT CAUSALLY MEASURABLE
 *     - We cannot establish that an intervention was unnecessary from
 *       the available data. Reporting this as a defensible null.
 */

import { db } from '@/lib/db'
import { EVALUATION_VERSION, INEFFECTIVE_WINDOW_HOURS, EXECUTED_STATUSES } from './types'
import type { InterventionEffectivenessMetrics, ActionEffectiveness } from './types'

/**
 * Get intervention effectiveness metrics.
 *
 * Strategy:
 * 1. Get all attempts with their evaluations
 * 2. Classify unevaluated attempts in-memory (non-persisted, for real-time view)
 * 3. Compute aggregates
 */
export async function getInterventionEffectivenessMetrics(): Promise<InterventionEffectivenessMetrics> {
  // Get all terminal attempts
  const attempts = await db.recoveryAttempt.findMany({
    where: {
      completedAt: { not: null },
    },
    include: {
      interventionEvaluation: { select: { outcome: true } },
      recoveryCase: { select: { priority: true, recoveryProbability: true } },
      recoveryAttributions: {
        where: { status: 'attributed' },
        select: { amount: true },
      },
    },
  })

  const totals = {
    executed: 0,
    recovered: 0,
    ineffective: 0,
    blocked: 0,
    cancelled: 0,
    preempted: 0,
    unknown: 0,
    recoveredRevenue: 0,
  }

  const byAction: Record<string, ActionEffectiveness> = {}
  const byProbabilityBand: Record<string, { executed: number; recovered: number; ineffective: number }> = {}
  const byPriority: Record<string, { executed: number; recovered: number; ineffective: number }> = {}

  // Probability bands
  const BANDS = [
    { name: 'high (>=0.6)', min: 0.6, max: 1.0 },
    { name: 'medium (0.3-0.6)', min: 0.3, max: 0.6 },
    { name: 'low (<0.3)', min: 0.0, max: 0.3 },
  ]
  for (const band of BANDS) {
    byProbabilityBand[band.name] = { executed: 0, recovered: 0, ineffective: 0 }
  }

  for (const attempt of attempts) {
    const action = attempt.action
    const isExecuted = EXECUTED_STATUSES.has(attempt.status)
    const outcome = attempt.interventionEvaluation?.outcome ?? deriveQuickOutcome(attempt)
    const recoveredRevenue = attempt.recoveryAttributions.reduce((sum, a) => sum + a.amount, 0)

    // Determine which bucket this falls into
    if (isExecuted) {
      totals.executed++
    }

    switch (outcome) {
      case 'RECOVERED':
        totals.recovered++
        totals.recoveredRevenue += recoveredRevenue
        break
      case 'INEFFECTIVE':
        totals.ineffective++
        break
      case 'BLOCKED':
        totals.blocked++
        break
      case 'CANCELLED':
        totals.cancelled++
        break
      case 'PREEMPTED':
        totals.preempted++
        break
      case 'UNKNOWN':
        totals.unknown++
        break
    }

    // Per-action breakdown (only for evaluables)
    if (!byAction[action]) {
      byAction[action] = {
        action,
        executed: 0,
        recovered: 0,
        ineffective: 0,
        blocked: 0,
        cancelled: 0,
        preempted: 0,
        unknown: 0,
        recoveredRevenue: 0,
        successRate: null,
        ineffectiveRate: null,
        falseInterventionRate: 'NOT_CAUSALLY_MEASURABLE',
      }
    }
    if (isExecuted) byAction[action].executed++
    if (outcome === 'RECOVERED') { byAction[action].recovered++; byAction[action].recoveredRevenue += recoveredRevenue }
    if (outcome === 'INEFFECTIVE') byAction[action].ineffective++
    if (outcome === 'BLOCKED') byAction[action].blocked++
    if (outcome === 'CANCELLED') byAction[action].cancelled++
    if (outcome === 'PREEMPTED') byAction[action].preempted++
    if (outcome === 'UNKNOWN') byAction[action].unknown++

    // Per-probability-band breakdown (only executed)
    if (isExecuted) {
      const prob = attempt.recoveryCase.recoveryProbability
      const band = BANDS.find(b => prob >= b.min && prob < b.max) ?? BANDS[2]
      if (outcome === 'RECOVERED') byProbabilityBand[band.name].recovered++
      if (outcome === 'INEFFECTIVE') byProbabilityBand[band.name].ineffective++
      byProbabilityBand[band.name].executed++
    }

    // Per-priority breakdown (only executed)
    if (isExecuted) {
      const priority = attempt.recoveryCase.priority
      if (!byPriority[priority]) byPriority[priority] = { executed: 0, recovered: 0, ineffective: 0 }
      if (outcome === 'RECOVERED') byPriority[priority].recovered++
      if (outcome === 'INEFFECTIVE') byPriority[priority].ineffective++
      byPriority[priority].executed++
    }
  }

  // Compute rates
  const executedDenominator = totals.recovered + totals.ineffective + totals.unknown

  const interventionSuccessRate = executedDenominator > 0
    ? totals.recovered / executedDenominator
    : null

  const ineffectiveInterventionRate = executedDenominator > 0
    ? totals.ineffective / executedDenominator
    : null

  // Compute per-action rates
  for (const action of Object.keys(byAction)) {
    const m = byAction[action]
    const actionDenom = m.recovered + m.ineffective + m.unknown
    m.successRate = actionDenom > 0 ? m.recovered / actionDenom : null
    m.ineffectiveRate = actionDenom > 0 ? m.ineffective / actionDenom : null
  }

  return {
    totalExecuted: totals.executed,
    totalRecovered: totals.recovered,
    totalIneffective: totals.ineffective,
    totalBlocked: totals.blocked,
    totalCancelled: totals.cancelled,
    totalPreempted: totals.preempted,
    totalUnknown: totals.unknown,
    totalRecoveredRevenue: totals.recoveredRevenue,
    interventionSuccessRate,
    ineffectiveInterventionRate,
    falseInterventionRate: 'NOT_CAUSALLY_MEASURABLE',
    evaluationVersion: EVALUATION_VERSION,
    byAction,
    byProbabilityBand,
    byPriority,
  }
}

/**
 * Quick in-memory outcome derivation for attempts not yet evaluated.
 * Used only for real-time metrics — does NOT persist.
 */
function deriveQuickOutcome(attempt: {
  status: string
  recoveredAmount: number
  completedAt: Date | null
  interventionEvaluation: { outcome: string } | null
}): 'RECOVERED' | 'INEFFECTIVE' | 'BLOCKED' | 'CANCELLED' | 'PREEMPTED' | 'UNKNOWN' {
  if (attempt.interventionEvaluation) {
    return attempt.interventionEvaluation.outcome as 'RECOVERED' | 'INEFFECTIVE' | 'BLOCKED' | 'CANCELLED' | 'PREEMPTED' | 'UNKNOWN'
  }

  if (attempt.status === 'blocked') return 'BLOCKED'
  if (attempt.status === 'cancelled') return 'CANCELLED'
  if (attempt.status === 'pending' || attempt.status === 'queued' || attempt.status === 'running') return 'UNKNOWN'
  if (attempt.recoveredAmount > 0) return 'RECOVERED'

  // Executed but no attribution — check time window
  const completedAt = attempt.completedAt
  if (!completedAt) return 'UNKNOWN'

  const hoursSince = (Date.now() - completedAt.getTime()) / (1000 * 60 * 60)
  return hoursSince >= INEFFECTIVE_WINDOW_HOURS ? 'INEFFECTIVE' : 'UNKNOWN'
}
