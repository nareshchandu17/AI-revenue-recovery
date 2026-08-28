/**
 * InterventionOutcomeEvaluator — Domain Service (Feature 7)
 *
 * Centralized service that classifies the outcome of recovery interventions.
 * Lives in the domain layer — NOT in React, API routes, webhook controller,
 * or BullMQ worker.
 *
 * Evaluation is triggered:
 *   1. After successful attribution (RECOVERED classification)
 *   2. On-demand for batch evaluation of stale attempts
 *
 * Classification logic uses ONLY persisted data:
 *   - RecoveryAttempt status, timestamps
 *   - RecoveryAttribution records
 *   - RecoveryCase status, timestamps
 *   - Payment timestamps
 *
 * Temporal reasoning:
 *   - If attribution.payment.createdAt > attempt.completedAt → intervention
 *     preceded the payment → RECOVERED (if attribution exists)
 *   - If payment was captured BEFORE attempt.completedAt → PREEMPTED
 *   - If attempt completed > INEFFECTIVE_WINDOW_HOURS ago with no attribution → INEFFECTIVE
 *   - If attempt completed < INEFFECTIVE_WINDOW_HOURS ago with no attribution → UNKNOWN
 */

import { db } from '@/lib/db'
import { logAudit } from '@/services/audit/log'
import { logger } from '@/lib/logger'
import { TERMINAL_ATTEMPT_STATUSES } from '@/lib/state-machine'
import {
  EVALUATION_VERSION,
  INEFFECTIVE_WINDOW_HOURS,
  EVALUABLE_ACTIONS,
  EXECUTED_STATUSES,
  NON_INTERVENTION_STATUSES,
} from './types'
import type { EvaluationResult } from './types'
import type { InterventionOutcome } from '@prisma/client'

// --- Public API -----------------------------------------------------------

/**
 * Evaluate a single attempt. Idempotent: if an evaluation already exists
 * for this attemptId, returns the existing evaluation (historical immutability).
 */
export async function evaluateAttempt(attemptId: string): Promise<EvaluationResult | null> {
  // Check for existing evaluation (idempotent)
  const existing = await db.interventionEvaluation.findUnique({
    where: { recoveryAttemptId: attemptId },
  })
  if (existing) {
    return evaluationToResult(existing)
  }

  // Load attempt with relations
  const attempt = await db.recoveryAttempt.findUnique({
    where: { id: attemptId },
    include: {
      recoveryCase: {
        include: {
          payment: { select: { status: true, externalId: true, createdAt: true } },
        },
      },
      recoveryAttributions: {
        where: { status: 'attributed' },
        include: { payment: { select: { createdAt: true } } },
      },
    },
  })

  if (!attempt) return null

  const { outcome, reason } = classifyAttempt(attempt)

  // Persist the evaluation
  const evaluation = await db.interventionEvaluation.create({
    data: {
      recoveryAttemptId: attempt.id,
      recoveryCaseId: attempt.recoveryCaseId,
      outcome,
      classificationReason: reason,
      evaluationVersion: EVALUATION_VERSION,
    },
  })

  // Audit
  const auditEventType = getAuditEventType(outcome)
  await logAudit({
    caseId: attempt.recoveryCaseId,
    actor: { type: 'system' },
    eventType: auditEventType,
    entityType: 'intervention_evaluation',
    entityId: evaluation.id,
    action: attempt.action,
    details: `Intervention outcome evaluated: ${outcome}. ${reason}`,
    metadata: {
      attemptId: attempt.id,
      action: attempt.action,
      outcome,
      evaluationVersion: EVALUATION_VERSION,
      attemptStatus: attempt.status,
      completedAt: attempt.completedAt,
    },
  })

  logger.info('INTERVENTION_OUTCOME_EVALUATED', {
    attempt: attempt.id,
    case: attempt.recoveryCaseId,
    action: attempt.action,
    outcome,
    reason,
    evaluationVersion: EVALUATION_VERSION,
  })

  return evaluationToResult(evaluation)
}

/**
 * Evaluate a specific attempt as RECOVERED after attribution.
 * Called by the attribution service after successful attribution.
 * This is the primary trigger for RECOVERED classification.
 */
export async function markRecovered(attemptId: string, attributionId: string): Promise<EvaluationResult | null> {
  // Idempotent: if already evaluated, do NOT overwrite
  const existing = await db.interventionEvaluation.findUnique({
    where: { recoveryAttemptId: attemptId },
  })
  if (existing) {
    return evaluationToResult(existing)
  }

  const attempt = await db.recoveryAttempt.findUnique({
    where: { id: attemptId },
    select: { recoveryCaseId: true, action: true, completedAt: true },
  })
  if (!attempt) return null

  const reason = `Verified attribution ${attributionId} links revenue to this intervention.`

  const evaluation = await db.interventionEvaluation.create({
    data: {
      recoveryAttemptId: attemptId,
      recoveryCaseId: attempt.recoveryCaseId,
      outcome: 'RECOVERED',
      classificationReason: reason,
      evaluationVersion: EVALUATION_VERSION,
    },
  })

  await logAudit({
    caseId: attempt.recoveryCaseId,
    actor: { type: 'webhook', source: 'razorpay' },
    eventType: 'INTERVENTION_CLASSIFIED_RECOVERED',
    entityType: 'intervention_evaluation',
    entityId: evaluation.id,
    action: attempt.action,
    details: `Intervention RECOVERED via attribution ${attributionId}. ${reason}`,
    metadata: {
      attemptId,
      attributionId,
      action: attempt.action,
      evaluationVersion: EVALUATION_VERSION,
    },
  })

  logger.info('INTERVENTION_CLASSIFIED_RECOVERED', {
    attempt: attemptId,
    case: attempt.recoveryCaseId,
    attribution: attributionId,
  })

  return evaluationToResult(evaluation)
}

/**
 * Batch-evaluate attempts that don't yet have an evaluation.
 * Designed to be called periodically (e.g. cron) or on-demand.
 * Does NOT re-evaluate already-classified attempts.
 *
 * Returns count of newly evaluated attempts.
 */
export async function batchEvaluatePending(maxCount: number = 100): Promise<number> {
  // Find attempts that are terminal and evaluatable but not yet evaluated
  const unevaulatedAttempts = await db.recoveryAttempt.findMany({
    where: {
      status: { in: [...EXECUTED_STATUSES, ...NON_INTERVENTION_STATUSES] },
      interventionEvaluation: null,
      completedAt: { not: null },
    },
    select: { id: true },
    take: maxCount,
  })

  let evaluated = 0
  for (const attempt of unevaulatedAttempts) {
    try {
      const result = await evaluateAttempt(attempt.id)
      if (result) evaluated++
    } catch (err) {
      logger.error('BATCH_EVALUATION_FAILED', {
        attempt: attempt.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return evaluated
}

// --- Classification Logic -------------------------------------------------

interface AttemptWithRelations {
  id: string
  recoveryCaseId: string
  action: string
  status: string
  completedAt: Date | null
  attemptedAt: Date
  recoveredAmount: number
  recoveryCase: {
    status: string
    resolvedAt: Date | null
    recoveredAmount: number
    payment: {
      status: string
      externalId: string
      createdAt: Date
    } | null
  }
  recoveryAttributions: Array<{
    id: string
    amount: number
    status: string
    payment: { createdAt: Date } | null
  }>
}

/**
 * Classify a single attempt based on persisted data.
 *
 * Classification rules (in order):
 * 1. BLOCKED / CANCELLED — not an intervention, classify directly
 * 2. RECOVERED — attribution exists linking to this attempt
 * 3. PREEMPTED — payment captured before attempt completed
 * 4. INEFFECTIVE — executed, no attribution, window expired
 * 5. UNKNOWN — executed, no attribution, window not yet expired
 */
function classifyAttempt(attempt: AttemptWithRelations): {
  outcome: InterventionOutcome
  reason: string
} {
  // Non-intervention statuses: classify directly
  if (attempt.status === 'blocked') {
    return {
      outcome: 'BLOCKED',
      reason: `Attempt was blocked before execution. Reason: ${attempt.recoveredAmount === 0 ? 'policy gate' : 'see attempt failureReason'}. Not an intervention.`,
    }
  }

  if (attempt.status === 'cancelled') {
    return {
      outcome: 'CANCELLED',
      reason: 'Attempt was cancelled before execution. Not an intervention.',
    }
  }

  // Non-executable statuses should not reach here, but handle defensively
  if (attempt.status === 'pending' || attempt.status === 'queued' || attempt.status === 'running') {
    return {
      outcome: 'UNKNOWN',
      reason: `Attempt is in non-terminal state '${attempt.status}'. Cannot evaluate yet.`,
    }
  }

  // RECOVERED: verified attribution exists
  if (attempt.recoveryAttributions.length > 0) {
    const totalAttributed = attempt.recoveryAttributions.reduce((sum, a) => sum + a.amount, 0)
    if (totalAttributed > 0) {
      return {
        outcome: 'RECOVERED',
        reason: `Verified attribution exists (${attempt.recoveryAttributions.length} attribution(s), ₹${(totalAttributed / 100).toFixed(2)} recovered).`,
      }
    }
  }

  // PREEMPTED: payment was captured BEFORE the attempt completed
  if (attempt.recoveryCase.payment?.status === 'captured' && attempt.completedAt) {
    const paymentCapturedAt = attempt.recoveryCase.payment.createdAt
    // If the payment was already captured when the attempt was created,
    // the intervention was preempted
    if (paymentCapturedAt && paymentCapturedAt < attempt.attemptedAt) {
      return {
        outcome: 'PREEMPTED',
        reason: `Payment was captured at ${paymentCapturedAt.toISOString()} before attempt execution at ${attempt.attemptedAt.toISOString()}. Not a false intervention — the attempt was never executed against a live problem.`,
      }
    }
  }

  // Also check: case resolved before attempt completed
  if (attempt.recoveryCase.resolvedAt && attempt.completedAt) {
    if (attempt.recoveryCase.resolvedAt < attempt.completedAt) {
      return {
        outcome: 'PREEMPTED',
        reason: `Case was resolved at ${attempt.recoveryCase.resolvedAt.toISOString()} before attempt completed at ${attempt.completedAt.toISOString()}.`,
      }
    }
  }

  // INEFFECTIVE vs UNKNOWN: time-based
  const now = new Date()
  const completedAt = attempt.completedAt ?? attempt.attemptedAt
  const hoursSinceCompletion = (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60)

  if (hoursSinceCompletion >= INEFFECTIVE_WINDOW_HOURS) {
    return {
      outcome: 'INEFFECTIVE',
      reason: `No verified attribution after ${(hoursSinceCompletion / 24).toFixed(1)} days. Execution completed at ${completedAt.toISOString()}.`,
    }
  }

  return {
    outcome: 'UNKNOWN',
    reason: `Insufficient time elapsed since execution (${hoursSinceCompletion.toFixed(1)}h < ${INEFFECTIVE_WINDOW_HOURS}h window). Cannot determine outcome yet.`,
  }
}

// --- Helpers ---------------------------------------------------------------

function evaluationToResult(evaluation: {
  id: string
  recoveryAttemptId: string
  recoveryCaseId: string
  outcome: InterventionOutcome
  classificationReason: string
  evaluationVersion: string
  evaluatedAt: Date
}): EvaluationResult {
  return {
    attemptId: evaluation.recoveryAttemptId,
    caseId: evaluation.recoveryCaseId,
    action: '', // Filled by caller if needed
    outcome: evaluation.outcome,
    classificationReason: evaluation.classificationReason,
    evaluationVersion: evaluation.evaluationVersion,
    evaluatedAt: evaluation.evaluatedAt,
  }
}

function getAuditEventType(outcome: InterventionOutcome): string {
  switch (outcome) {
    case 'RECOVERED': return 'INTERVENTION_CLASSIFIED_RECOVERED'
    case 'INEFFECTIVE': return 'INTERVENTION_CLASSIFIED_INEFFECTIVE'
    case 'PREEMPTED': return 'INTERVENTION_CLASSIFIED_PREEMPTED'
    case 'BLOCKED': return 'INTERVENTION_CLASSIFIED_BLOCKED'
    case 'CANCELLED': return 'INTERVENTION_CLASSIFIED_CANCELLED'
    case 'UNKNOWN': return 'INTERVENTION_OUTCOME_EVALUATED'
  }
}
