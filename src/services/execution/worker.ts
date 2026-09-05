/**
 * BullMQ Worker for recovery execution.
 *
 * Flow per job:
 *   1. Receive job data (attempt ID, case ID, action)
 *   2. Load RecoveryAttempt from DB
 *   3. Verify current state (must be 'queued')
 *   4. Re-check payment status from DB (may have been captured since queuing)
 *   5. Re-check case status (still open?)
 *   6. Re-check policy (still valid?)
 *   7. Transition to 'running'
 *   8. Call appropriate executor
 *   9. Persist result (success/fail/blocked)
 *  10. Create AuditEvent
 *  11. Update case status if needed
 *
 * This worker NEVER:
 *   - Calls the AI directly
 *   - Modifies payment amounts
 *   - Pretends simulated actions are real
 */

import { Worker, type Job } from "bullmq"
import { getRedisConnection, isRedisAvailable } from "./redis"
import { QUEUE_NAME, VALID_TRANSITIONS, type RecoveryJobData, type RecoveryJobResult, STOP_REASONS, InvalidStateTransitionError } from "./types"
import { getExecutor } from "./executors"
import { checkExecutionGate } from "./gate"
import { evaluateStoppingRules } from "./stop-evaluator"
import { db } from "@/lib/db"
import { logAudit } from "@/services/audit/log"
import { TERMINAL_CASE_STATUSES } from "@/services/recovery/detection/constants"
import { classifyFailure } from "./failure-taxonomy"

let _worker: Worker | null = null

/**
 * Start the recovery execution worker.
 * Returns the worker instance.
 */
export function startWorker(): Worker {
  if (_worker) return _worker

  if (!isRedisAvailable()) {
    throw new Error("Redis is not available — worker cannot start")
  }

  const connection = getRedisConnection()

  _worker = new Worker<RecoveryJobData, RecoveryJobResult>(
    QUEUE_NAME,
    processJob,
    {
      connection,
      concurrency: 5, // Process up to 5 jobs in parallel
      limiter: {
        max: 20, // Max 20 jobs per duration
        duration: 60_000, // Per minute
      },
    }
  )

  _worker.on("completed", (job) => {
    console.log(
      `[worker] Job completed: jobId=${job.id}, attemptId=${job.data.recoveryAttemptId}, result=${JSON.stringify(job.returnvalue)}`
    )
  })

  _worker.on("failed", (job, err) => {
    console.error(
      `[worker] Job failed: jobId=${job?.id}, attemptId=${job?.data.recoveryAttemptId}, error=${err.message}`
    )
  })

  _worker.on("error", (err) => {
    console.error(`[worker] Worker error: ${err.message}`)
  })

  console.log("[worker] Recovery execution worker started")

  return _worker
}

/**
 * Stop the worker gracefully.
 */
export async function stopWorker(): Promise<void> {
  if (_worker) {
    await _worker.close()
    _worker = null
    console.log("[worker] Stopped")
  }
}

/** Get worker reference (for testing). */
export function getWorker(): Worker | null {
  return _worker
}

/** Reset worker singleton (for testing). */
export function resetWorker(): void {
  _worker = null
}

// --- Job Processor ----------------------------------------------------------

export async function processJob(
  job: { id?: string; data: any }
): Promise<RecoveryJobResult> {
  const { recoveryAttemptId, recoveryCaseId, agentDecisionId, action } = job.data

  console.log(
    `[worker] Processing: jobId=${job.id}, attemptId=${recoveryAttemptId}, caseId=${recoveryCaseId}, action=${action}`
  )

  // 1. Load the RecoveryAttempt
  const attempt = await db.recoveryAttempt.findUnique({
    where: { id: recoveryAttemptId },
    include: {
      recoveryCase: {
        include: {
          payment: { select: { externalId: true, customerId: true, status: true, merchantId: true } },
          merchant: { select: { id: true } },
        },
      },
      agentDecision: { select: { id: true } },
    },
  })

  if (!attempt) {
    console.error(`[worker] RecoveryAttempt ${recoveryAttemptId} not found`)
    return { recoveryAttemptId, status: "failed", failureReason: "Attempt not found", simulated: false }
  }

  // 2. Verify state — must be 'queued'
  if (attempt.status !== "queued") {
    console.warn(
      `[worker] Attempt ${recoveryAttemptId} is in state '${attempt.status}', expected 'queued' — skipping`
    )
    return { recoveryAttemptId, status: "blocked", failureReason: `Invalid state: ${attempt.status}`, simulated: false }
  }

  // 3. Evaluate stopping rules
  const stopResult = await evaluateStoppingRules(recoveryCaseId, action, agentDecisionId, recoveryAttemptId)
  if (stopResult.shouldStop) {
    await transitionAttempt(attempt.id, "blocked", stopResult.reason ?? "Blocked by rule")
    await auditAttemptTransition(attempt, "blocked", stopResult.reason ?? "Blocked by rule", { rule: stopResult.rule, details: stopResult.details })
    return { recoveryAttemptId, status: "blocked", failureReason: stopResult.reason ?? "Blocked by rule", simulated: false }
  }

  // 6. Transition to 'running'
  await transitionAttempt(attempt.id, "running")
  await db.recoveryAttempt.update({
    where: { id: attempt.id },
    data: { startedAt: new Date(), jobId: job.id ?? "" },
  })
  await auditAttemptTransition(attempt, "running")

  // 7. Get the executor and execute
  const executor = getExecutor(action)
  const payment = attempt.recoveryCase.payment
  const customerId = payment?.customerId ?? ""

  let executorResult
  try {
    executorResult = await executor.execute({
      recoveryCaseId,
      agentDecisionId,
      action,
      amountAtRisk: attempt.recoveryCase.amountAtRisk,
      currency: attempt.recoveryCase.currency,
      customerId,
      merchantId: attempt.recoveryCase.merchantId,
      paymentExternalId: payment?.externalId ?? null,
      attemptNumber: attempt.attemptNumber,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    await transitionAttempt(attempt.id, "failed", `Executor error: ${errorMsg}`)
    await auditAttemptTransition(attempt, "failed", `Executor error: ${errorMsg}`)
    return { recoveryAttemptId, status: "failed", failureReason: errorMsg, simulated: false }
  }

  // 8. Persist result
  if (executorResult.success) {
    // NOTE: We do NOT set recoveredAmount here.
    // Sending a reminder or creating a payment link does NOT mean money was recovered.
    // Task 7 will implement recovery attribution from actual payment events.
    await transitionAttempt(attempt.id, "succeeded")
    await db.recoveryAttempt.update({
      where: { id: attempt.id },
      data: {
        externalRef: executorResult.externalRef,
        simulated: executorResult.simulated,
      },
    })
    await auditAttemptTransition(attempt, "succeeded", executorResult.summary, {
      simulated: executorResult.simulated,
      externalRef: executorResult.externalRef,
      executorDetails: executorResult.details,
    })

    // 9. Update case status to 'executing' if it was in a pre-execution state
    if (attempt.recoveryCase.status === "diagnosed" || attempt.recoveryCase.status === "awaiting_approval") {
      await db.recoveryCase.update({
        where: { id: recoveryCaseId },
        data: { status: "executing" },
      })
    }

    return {
      recoveryAttemptId,
      status: "succeeded",
      externalRef: executorResult.externalRef,
      simulated: executorResult.simulated,
    }
  } else {
    await transitionAttempt(attempt.id, "failed", executorResult.summary)
    await auditAttemptTransition(attempt, "failed", executorResult.summary)
    return {
      recoveryAttemptId,
      status: "failed",
      failureReason: executorResult.summary,
      simulated: executorResult.simulated,
    }
  }
}

// --- Internal Helpers -------------------------------------------------------

/** Transition a RecoveryAttempt to a new status with validation. */
async function transitionAttempt(
  attemptId: string,
  newStatus: "succeeded" | "failed" | "blocked" | "running",
  failureReason?: string
): Promise<void> {
  const attempt = await db.recoveryAttempt.findUnique({
    where: { id: attemptId },
    select: { status: true },
  })

  if (!attempt) return

  const allowed = VALID_TRANSITIONS[attempt.status] ?? []
  if (!allowed.includes(newStatus)) {
    throw new InvalidStateTransitionError(attempt.status, newStatus)
  }

  const updateData: Record<string, unknown> = {
    status: newStatus,
    failureReason: failureReason ?? "",
  }

  if (failureReason && (newStatus === "failed" || newStatus === "blocked")) {
    const categoryHint = newStatus === "blocked" ? "POLICY_BLOCK" : undefined;
    const explanation = classifyFailure(failureReason, categoryHint as any)
    updateData.failureCategory = explanation.category
    updateData.nextStep = explanation.nextAction
  }

  if (newStatus === "succeeded" || newStatus === "failed" || newStatus === "blocked") {
    updateData.completedAt = new Date()
  }

  await db.recoveryAttempt.update({
    where: { id: attemptId },
    data: updateData,
  })
}

/** Create an audit event for an attempt state transition. */
async function auditAttemptTransition(
  attempt: {
    id: string
    recoveryCaseId: string
    agentDecisionId: string | null
    action: string
    attemptNumber: number
    recoveryCase: { merchantId: string }
  },
  newStatus: string,
  details?: string,
  extraMetadata?: Record<string, unknown>
) {
  const eventType = `RECOVERY_ATTEMPT_${newStatus.toUpperCase()}` as const

  await logAudit({
    caseId: attempt.recoveryCaseId,
    actor: { type: "system" },
    eventType,
    entityType: "recovery_attempt",
    entityId: attempt.id,
    action: attempt.action,
    details: details ?? `Attempt ${attempt.attemptNumber} transitioned to ${newStatus}`,
    metadata: {
      attemptId: attempt.id,
      agentDecisionId: attempt.agentDecisionId,
      action: attempt.action,
      attemptNumber: attempt.attemptNumber,
      newStatus,
      merchantId: attempt.recoveryCase.merchantId,
      ...extraMetadata,
    },
  })
}