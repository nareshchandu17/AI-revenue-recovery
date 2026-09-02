/**
 * Recovery Execution Service — main orchestrator.
 *
 * Flow:
 *   POST /api/recovery/cases/:id/execute
 *   → Validate case
 *   → Load latest approved AgentDecision
 *   → Check DND gate
 *   → Check contact frequency policy
 *   → Run execution gate
 *   → Record communication event (or block)
 *   → Determine approval requirement
 *   → Create RecoveryAttempt (PENDING)
 *   → Transition to QUEUED
 *   → Enqueue BullMQ job
 *   → Return attempt/job info
 *
 * IMPORTANT: This service does NOT execute the action synchronously.
 * It creates the attempt, queues it, and returns immediately.
 */

import { db } from '@/lib/db'
import { logAudit } from '@/services/audit/log'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { REQUIRES_MERCHANT_APPROVAL, QueueUnavailableError, InvalidStateTransitionError, ExecutionGateError, VALID_TRANSITIONS } from './types'
import type { ExecuteResult, RecoveryAction, RecoveryAttemptStatus } from './types'
import { checkExecutionGate } from './gate'
import { enqueueRecoveryJob } from './queue'
import { getExecutor } from './executors'
import { TERMINAL_CASE_STATUSES } from '@/services/recovery/detection/constants'
import { CUSTOMER_FACING_ACTIONS, ACTION_DEFAULT_CHANNEL, checkContactEligibility, recordCommunicationEvent } from '@/services/contact-policy'
import { checkDNDEligibility } from '@/services/dnd'

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

  log.info('Starting recovery execution')

  // 1. Load the recovery case with relations
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      payment: { select: { externalId: true, customerId: true, status: true, merchantId: true } },
      merchant: { select: { id: true } },
      agentDecisions: {
        where: { status: { in: ['approved', 'pending'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      recoveryAttempts: {
        orderBy: { attemptNumber: 'desc' },
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
    throw new ValidationError('No approved or pending AgentDecision found for this case')
  }

  const action = decision.recommendedAction as RecoveryAction
  const customerId = recoveryCase.payment?.customerId ?? ''
  const idempotencyKey = `attempt:${caseId}:${action}:${decision.id}`

  // 3. If the decision is pending and requires approval, don't auto-execute
  if (decision.status === 'pending' && REQUIRES_MERCHANT_APPROVAL[action]) {
    // Update case to awaiting_approval
    await db.recoveryCase.update({
      where: { id: caseId },
      data: { status: 'awaiting_approval' },
    })

    await logAudit({
      caseId,
      actor: { type: 'system' },
      eventType: 'RECOVERY_ATTEMPT_BLOCKED',
      entityType: 'recovery_case',
      entityId: caseId,
      action,
      details: `Execution blocked: action '${action}' requires merchant approval. Case set to awaiting_approval.`,
      metadata: {
        caseId,
        decisionId: decision.id,
        action,
        reason: 'REQUIRES_MERCHANT_APPROVAL',
      },
    })

    return {
      caseId,
      attemptId: '',
      action,
      status: 'awaiting_approval',
      requiresApproval: true,
    }
  }

  // 4. If decision is rejected, block
  if (decision.status === 'rejected') {
    throw new ValidationError(`AgentDecision was rejected by policy. Reason: check decision details.`)
  }

  // 5. DND + Contact frequency checks (before gate, for customer-facing actions)
  if (customerId && CUSTOMER_FACING_ACTIONS.has(action)) {
    const channel = ACTION_DEFAULT_CHANNEL[action] ?? 'email'

    // 5a. DND check
    const dndResult = await checkDNDEligibility({
      customerId,
      merchantId: recoveryCase.merchantId,
      channel: channel as 'email',
      caseId,
    })

    if (!dndResult.allowed) {
      await logAudit({
        caseId,
        actor: { type: 'system' },
        eventType: 'RECOVERY_ATTEMPT_BLOCKED',
        entityType: 'recovery_case',
        entityId: caseId,
        action,
        details: `Execution blocked by DND: ${dndResult.reason}`,
        metadata: {
          caseId,
          decisionId: decision.id,
          action,
          reason: 'DO_NOT_CONTACT',
          blockReason: dndResult.blockReason,
          customerId,
        },
      })
      throw new ExecutionGateError(`DO_NOT_CONTACT: ${dndResult.reason}`)
    }

    // 5b. Contact frequency check
    const contactResult = await checkContactEligibility({
      customerId,
      merchantId: recoveryCase.merchantId,
      action,
      channel,
      caseId,
      idempotencyKey,
    })

    if (!contactResult.allowed) {
      // Record the blocked communication event
      await recordCommunicationEvent({
        customerId,
        merchantId: recoveryCase.merchantId,
        caseId,
        action,
        channel,
        idempotencyKey,
        status: 'blocked',
        blockReason: contactResult.blockReason ?? 'CONTACT_FREQUENCY_LIMIT',
        nextEligibleAt: contactResult.nextEligibleAt ? new Date(contactResult.nextEligibleAt) : undefined,
        details: contactResult.reason ?? undefined,
      })

      await logAudit({
        caseId,
        actor: { type: 'system' },
        eventType: 'RECOVERY_ATTEMPT_BLOCKED',
        entityType: 'recovery_case',
        entityId: caseId,
        action,
        details: `Execution blocked by contact frequency: ${contactResult.reason}`,
        metadata: {
          caseId,
          decisionId: decision.id,
          action,
          reason: 'CONTACT_FREQUENCY_LIMIT',
          blockReason: contactResult.blockReason,
          nextEligibleAt: contactResult.nextEligibleAt,
          contactUsage: contactResult.usage,
          customerId,
        },
      })
      throw new ExecutionGateError(`CONTACT_FREQUENCY_LIMIT: ${contactResult.reason}`)
    }
  }

  // 6. Run execution gate
  const gateResult = await checkExecutionGate({
    caseId,
    decisionId: decision.id,
    action,
    merchantId: recoveryCase.merchantId,
    amountAtRisk: recoveryCase.amountAtRisk,
    recoveryProbability: recoveryCase.recoveryProbability,
    customerId,
    idempotencyKey,
  })

  if (!gateResult.eligible) {
    await logAudit({
      caseId,
      actor: { type: 'system' },
      eventType: 'RECOVERY_ATTEMPT_BLOCKED',
      entityType: 'recovery_case',
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

    throw new ExecutionGateError(gateResult.reason ?? 'Execution gate blocked')
  }

  // 7. Calculate attempt number
  const lastAttemptNumber = recoveryCase.recoveryAttempts[0]?.attemptNumber ?? 0
  const attemptNumber = lastAttemptNumber + 1

  // 8. Create RecoveryAttempt (PENDING)
  const attempt = await db.recoveryAttempt.create({
    data: {
      recoveryCaseId: caseId,
      agentDecisionId: decision.id,
      action,
      status: 'pending',
      attemptNumber,
      recoveredAmount: 0,
      scheduledAt: new Date(),
    },
  })

  // 9. Record communication event for customer-facing actions
  let communicationEventId: string | null = null
  if (customerId && CUSTOMER_FACING_ACTIONS.has(action)) {
    const channel = ACTION_DEFAULT_CHANNEL[action] ?? 'email'
    communicationEventId = await recordCommunicationEvent({
      customerId,
      merchantId: recoveryCase.merchantId,
      caseId,
      attemptId: attempt.id,
      action,
      channel,
      idempotencyKey,
      status: 'queued',
      details: `Queued for case ${caseId}, attempt #${attemptNumber}`,
    })
  }

  // 10. Audit: attempt created
  await logAudit({
    caseId,
    actor: { type: 'system' },
    eventType: 'RECOVERY_ATTEMPT_CREATED',
    entityType: 'recovery_attempt',
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
      ...(communicationEventId ? { communicationEventId } : {}),
    },
  })

  // 11. Transition PENDING → QUEUED
  const allowed = VALID_TRANSITIONS['pending' as keyof typeof VALID_TRANSITIONS]
  if (!allowed.includes('queued')) {
    throw new InvalidStateTransitionError('pending', 'queued')
  }

  await db.recoveryAttempt.update({
    where: { id: attempt.id },
    data: { status: 'queued' },
  })

  // 12. Audit: attempt queued
  await logAudit({
    caseId,
    actor: { type: 'system' },
    eventType: 'RECOVERY_ATTEMPT_QUEUED',
    entityType: 'recovery_attempt',
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

  // 13. Enqueue the job
  let jobId: string | undefined
  let executedSynchronously = false

  try {
    jobId = await enqueueRecoveryJob({
      recoveryAttemptId: attempt.id,
      recoveryCaseId: caseId,
      agentDecisionId: decision.id,
      action,
    }, attempt.id) // Use attempt ID as deterministic job ID for idempotency

    log.info('Recovery job queued', { attemptId: attempt.id, jobId })

    // Update attempt with the job ID
    await db.recoveryAttempt.update({
      where: { id: attempt.id },
      data: { jobId },
    })
  } catch (err) {
    if (err instanceof QueueUnavailableError || (err instanceof Error && err.message.includes('Redis'))) {
      // Redis unavailable — execute synchronously as fallback (demo/development mode)
      log.warn('Queue unavailable, executing synchronously as fallback')
      executedSynchronously = true
      await executeSynchronously({ attempt, recoveryCase, decisionId: decision.id, action, caseId, log })
    } else {
      throw err
    }
  }

  // 14. Update case status if appropriate
  if (!executedSynchronously && (recoveryCase.status === 'detected' || recoveryCase.status === 'diagnosed')) {
    await db.recoveryCase.update({
      where: { id: caseId },
      data: { status: 'executing' },
    })
  }

  // 15. Update communication event to sent if executed synchronously
  if (executedSynchronously && communicationEventId) {
    const { updateCommunicationStatus } = await import('@/services/contact-policy')
    await updateCommunicationStatus(communicationEventId, 'sent', 'Executed synchronously')
  }

  return {
    caseId,
    attemptId: attempt.id,
    action,
    status: executedSynchronously ? 'succeeded' : 'queued',
    requiresApproval: false,
    jobId,
  }
}

// --- Synchronous Execution Fallback (when Redis is unavailable) ---------------

interface SyncExecuteParams {
  attempt: { id: string; recoveryCaseId: string; attemptNumber: number; action: string }
  recoveryCase: {
    merchantId: string
    amountAtRisk: number
    currency: string
    status: string
    payment?: { externalId: string | null; customerId: string | null; status: string } | null
  }
  decisionId: string
  action: RecoveryAction
  caseId: string
  log: ReturnType<typeof logger.child>
}

/**
 * Execute a recovery attempt synchronously when Redis/BullMQ is unavailable.
 * This follows the same logic as the BullMQ worker but runs in-process.
 * Used for demo/development mode.
 */
async function executeSynchronously(params: SyncExecuteParams): Promise<void> {
  const { attempt, recoveryCase, decisionId, action, caseId, log } = params

  // 1. Re-check case is still open
  if ((TERMINAL_CASE_STATUSES as readonly string[]).includes(recoveryCase.status)) {
    await db.recoveryAttempt.update({
      where: { id: attempt.id },
      data: { status: 'blocked', failureReason: 'Case in terminal state', completedAt: new Date() },
    })
    return
  }

  // 2. Re-check payment status
  if (recoveryCase.payment?.externalId) {
    const freshPayment = await db.payment.findUnique({
      where: { externalId: recoveryCase.payment.externalId },
      select: { status: true },
    })
    if (freshPayment?.status === 'captured') {
      await db.recoveryAttempt.update({
        where: { id: attempt.id },
        data: { status: 'blocked', failureReason: 'Payment already captured', completedAt: new Date() },
      })
      return
    }
  }

  // 3. Re-check DND (state may have changed)
  const customerId = recoveryCase.payment?.customerId ?? ''
  if (customerId && CUSTOMER_FACING_ACTIONS.has(action)) {
    const { checkDNDEligibility: checkDND } = await import('@/services/dnd')
    const dnd = await checkDND({
      customerId,
      merchantId: recoveryCase.merchantId,
      caseId,
    })
    if (!dnd.allowed) {
      await db.recoveryAttempt.update({
        where: { id: attempt.id },
        data: { status: 'blocked', failureReason: `DND: ${dnd.reason}`, completedAt: new Date() },
      })
      return
    }
  }

  // 4. Transition to running
  await db.recoveryAttempt.update({
    where: { id: attempt.id },
    data: { status: 'running', startedAt: new Date() },
  })

  await logAudit({
    caseId,
    actor: { type: 'system' },
    eventType: 'RECOVERY_ATTEMPT_RUNNING',
    entityType: 'recovery_attempt',
    entityId: attempt.id,
    action,
    details: `Attempt #${attempt.attemptNumber} running (synchronous — no Redis)`,
    metadata: { attemptId: attempt.id, mode: 'synchronous' },
  })

  // 5. Execute
  const executor = getExecutor(action)

  let result
  try {
    result = await executor.execute({
      recoveryCaseId: caseId,
      agentDecisionId: decisionId,
      action,
      amountAtRisk: recoveryCase.amountAtRisk,
      currency: recoveryCase.currency,
      customerId,
      merchantId: recoveryCase.merchantId,
      paymentExternalId: recoveryCase.payment?.externalId ?? null,
      attemptNumber: attempt.attemptNumber,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    await db.recoveryAttempt.update({
      where: { id: attempt.id },
      data: { status: 'failed', failureReason: `Executor error: ${errorMsg}`, completedAt: new Date() },
    })
    await logAudit({
      caseId, actor: { type: 'system' },
      eventType: 'RECOVERY_ATTEMPT_FAILED',
      entityType: 'recovery_attempt', entityId: attempt.id, action,
      details: `Synchronous execution failed: ${errorMsg}`,
      metadata: { attemptId: attempt.id, error: errorMsg, mode: 'synchronous' },
    })
    return
  }

  // 6. Persist result
  if (result.success) {
    await db.recoveryAttempt.update({
      where: { id: attempt.id },
      data: { status: 'succeeded', externalRef: result.externalRef, simulated: result.simulated, completedAt: new Date() },
    })
    await logAudit({
      caseId, actor: { type: 'system' },
      eventType: 'RECOVERY_ATTEMPT_SUCCEEDED',
      entityType: 'recovery_attempt', entityId: attempt.id, action,
      details: `${result.summary} (synchronous)`,
      metadata: { attemptId: attempt.id, simulated: result.simulated, externalRef: result.externalRef, mode: 'synchronous' },
    })

    // Update case status
    if (recoveryCase.status === 'diagnosed' || recoveryCase.status === 'awaiting_approval') {
      await db.recoveryCase.update({
        where: { id: caseId },
        data: { status: 'executing' },
      })
    }
  } else {
    await db.recoveryAttempt.update({
      where: { id: attempt.id },
      data: { status: 'failed', failureReason: result.summary, completedAt: new Date() },
    })
    await logAudit({
      caseId, actor: { type: 'system' },
      eventType: 'RECOVERY_ATTEMPT_FAILED',
      entityType: 'recovery_attempt', entityId: attempt.id, action,
      details: `Synchronous execution failed: ${result.summary}`,
      metadata: { attemptId: attempt.id, mode: 'synchronous' },
    })
  }
}
