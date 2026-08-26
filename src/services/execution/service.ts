/**
 * Recovery Execution Service — main orchestrator.
 *
 * Flow:
 *   POST /api/recovery/cases/:id/execute
 *   → Validate case
 *   → Load latest approved AgentDecision
 *   → Run execution gate
 *   → Determine approval requirement
 *   → Create RecoveryAttempt (PENDING)
 *   → Transition to QUEUED
 *   → Enqueue BullMQ job
 *   → Return attempt/job info
 *
 * IMPORTANT: This service does NOT execute the action synchronously.
 * It creates the attempt, queues it, and returns immediately.
 */

import { db } from "@/lib/db"
import { logAudit } from "@/services/audit/log"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { REQUIRES_MERCHANT_APPROVAL, QueueUnavailableError, InvalidStateTransitionError, ExecutionGateError, VALID_TRANSITIONS } from "./types"
import type { ExecuteResult, RecoveryAction } from "./types"
import { checkExecutionGate } from "./gate"
import { enqueueRecoveryJob } from "./queue"
import { OPEN_CASE_STATUSES, TERMINAL_CASE_STATUSES } from "@/services/recovery/detection/constants"

export interface ExecuteParams {
  caseId: string
  /** Optional: use a specific decision. If not provided, uses the latest approved. */
  decisionId?: string
}

/**
 * Execute a recovery action for a case.
 * This is the main entry point called by the API route.
 */
export async function executeRecovery(params: ExecuteParams): Promise<ExecuteResult> {
  const { caseId, decisionId: overrideDecisionId } = params
  const log = logger.child({ recoveryCaseId: caseId })

  log.info("Starting recovery execution")

  // 1. Load the recovery case with relations
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      payment: { select: { externalId: true, customerId: true, status: true, merchantId: true } },
      merchant: { select: { id: true } },
      agentDecisions: {
        where: { status: { in: ["approved", "pending"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      recoveryAttempts: {
        orderBy: { attemptNumber: "desc" },
        take: 1,
        select: { attemptNumber: true },
      },
    },
  })

  if (!recoveryCase) {
    throw new NotFoundError(`RecoveryCase ${caseId} not found`)
  }

  // 2. Resolve the decision
  let decision: NonNullable<typeof recoveryCase.agentDecisions>[number] | null = recoveryCase.agentDecisions[0] ?? null
  if (overrideDecisionId) {
    const found = await db.agentDecision.findUnique({ where: { id: overrideDecisionId } })
    if (!found || found.recoveryCaseId !== caseId) {
      throw new NotFoundError(`AgentDecision ${overrideDecisionId} not found for this case`)
    }
    decision = found
  }

  if (!decision) {
    throw new ValidationError("No approved or pending AgentDecision found for this case")
  }

  const action = decision.recommendedAction as RecoveryAction

  // 3. If the decision is pending and requires approval, don't auto-execute
  if (decision.status === "pending" && REQUIRES_MERCHANT_APPROVAL[action]) {
    // Update case to awaiting_approval
    await db.recoveryCase.update({
      where: { id: caseId },
      data: { status: "awaiting_approval" },
    })

    await logAudit({
      caseId,
      actor: { type: "system" },
      eventType: "RECOVERY_ATTEMPT_BLOCKED",
      entityType: "recovery_case",
      entityId: caseId,
      action,
      details: `Execution blocked: action '${action}' requires merchant approval. Case set to awaiting_approval.`,
      metadata: {
        caseId,
        decisionId: decision.id,
        action,
        reason: "REQUIRES_MERCHANT_APPROVAL",
      },
    })

    return {
      caseId,
      attemptId: "",
      action,
      status: "awaiting_approval",
      requiresApproval: true,
    }
  }

  // 4. If decision is rejected, block
  if (decision.status === "rejected") {
    throw new ValidationError(`AgentDecision was rejected by policy. Reason: check decision details.`)
  }

  // 5. Run execution gate
  const gateResult = await checkExecutionGate({
    caseId,
    decisionId: decision.id,
    action,
    merchantId: recoveryCase.merchantId,
    amountAtRisk: recoveryCase.amountAtRisk,
    recoveryProbability: recoveryCase.recoveryProbability,
  })

  if (!gateResult.eligible) {
    await logAudit({
      caseId,
      actor: { type: "system" },
      eventType: "RECOVERY_ATTEMPT_BLOCKED",
      entityType: "recovery_case",
      entityId: caseId,
      action,
      details: `Execution gate blocked: ${gateResult.reason}`,
      metadata: {
        caseId,
        decisionId: decision.id,
        action,
        gateReason: gateResult.reason,
      },
    })

    throw new ExecutionGateError(gateResult.reason ?? "Execution gate blocked")
  }

  // 6. Calculate attempt number
  const lastAttemptNumber = recoveryCase.recoveryAttempts[0]?.attemptNumber ?? 0
  const attemptNumber = lastAttemptNumber + 1

  // 7. Create RecoveryAttempt (PENDING)
  const attempt = await db.recoveryAttempt.create({
    data: {
      recoveryCaseId: caseId,
      agentDecisionId: decision.id,
      action,
      status: "pending",
      attemptNumber,
      recoveredAmount: 0, // NEVER set recoveredAmount on action execution
      scheduledAt: new Date(),
    },
  })

  // 8. Audit: attempt created
  await logAudit({
    caseId,
    actor: { type: "system" },
    eventType: "RECOVERY_ATTEMPT_CREATED",
    entityType: "recovery_attempt",
    entityId: attempt.id,
    action,
    details: `Recovery attempt #${attemptNumber} created: ${action} for ₹${(recoveryCase.amountAtRisk / 100).toFixed(2)}`,
    metadata: {
      attemptId: attempt.id,
      decisionId: decision.id,
      action,
      attemptNumber,
      amountAtRisk: recoveryCase.amountAtRisk,
      requiresApproval: gateResult.requiresApproval,
    },
  })

  // 9. Transition PENDING → QUEUED
  const allowed = VALID_TRANSITIONS["pending" as keyof typeof VALID_TRANSITIONS]
  if (!allowed.includes("queued")) {
    throw new InvalidStateTransitionError("pending", "queued")
  }

  await db.recoveryAttempt.update({
    where: { id: attempt.id },
    data: { status: "queued" },
  })

  // 10. Audit: attempt queued
  await logAudit({
    caseId,
    actor: { type: "system" },
    eventType: "RECOVERY_ATTEMPT_QUEUED",
    entityType: "recovery_attempt",
    entityId: attempt.id,
    action,
    details: `Attempt #${attemptNumber} queued for execution`,
    metadata: {
      attemptId: attempt.id,
      decisionId: decision.id,
      action,
      attemptNumber,
      jobId: attempt.jobId,
    },
  })

  // 11. Enqueue the job
  let jobId: string | undefined
  try {
    jobId = await enqueueRecoveryJob({
      recoveryAttemptId: attempt.id,
      recoveryCaseId: caseId,
      agentDecisionId: decision.id,
      action,
    }, attempt.id) // Use attempt ID as deterministic job ID for idempotency

    log.info("Recovery job queued", { attemptId: attempt.id, jobId })

    // Update attempt with the job ID
    await db.recoveryAttempt.update({
      where: { id: attempt.id },
      data: { jobId },
    })
  } catch (err) {
    log.error("Queue unavailable")

    if (err instanceof QueueUnavailableError || (err instanceof Error && err.message.includes("Redis"))) {
      // Queue unavailable — mark attempt as failed, not queued
      await db.recoveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "failed",
          failureReason: "Queue unavailable — Redis not reachable",
          completedAt: new Date(),
        },
      })

      await logAudit({
        caseId,
        actor: { type: "system" },
        eventType: "RECOVERY_ATTEMPT_FAILED",
        entityType: "recovery_attempt",
        entityId: attempt.id,
        action,
        details: `Queue unavailable — Redis not reachable. Attempt marked as failed.`,
        metadata: {
          attemptId: attempt.id,
          decisionId: decision.id,
          action,
          error: "QUEUE_UNAVAILABLE",
        },
      })

      throw new QueueUnavailableError("Redis/queue is not available — attempt created but not queued")
    }
    throw err
  }

  // 12. Update case status if appropriate
  if (recoveryCase.status === "detected" || recoveryCase.status === "diagnosed") {
    await db.recoveryCase.update({
      where: { id: caseId },
      data: { status: "executing" },
    })
  }

  return {
    caseId,
    attemptId: attempt.id,
    action,
    status: "queued",
    requiresApproval: false,
    jobId,
  }
}