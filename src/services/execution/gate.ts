/**
 * Execution Gate — validates eligibility before queuing.
 *
 * This is the last deterministic check before a job enters the queue.
 * The gate enforces:
 *   1. Customer already recovered (payment captured)
 *   2. DND / opt-out check (HARD gate)
 *   3. Contact frequency cap
 *   4. Case state validity
 *   5. Decision freshness and status
 *   6. Policy compliance (retry limits, cooldowns, allowed actions)
 *   7. Amount validity
 *   8. Idempotency (no duplicate attempts)
 *
 * If the gate blocks, the attempt is NOT queued.
 */

import { db } from '@/lib/db'
import { OPEN_CASE_STATUSES, TERMINAL_CASE_STATUSES } from '@/services/recovery/detection/constants'
import { DEFAULT_MERCHANT_POLICY } from '@/services/recovery/agent/policy'
import { checkDNDEligibility } from '@/services/dnd'
import { checkContactEligibility, CUSTOMER_FACING_ACTIONS, ACTION_DEFAULT_CHANNEL } from '@/services/contact-policy'
import type { RecoveryAction } from '@prisma/client'
import type { GateResult } from './types'
import { STOP_REASONS, DECISION_EXPIRY_MINUTES } from './types'

export interface GateInput {
  caseId: string
  decisionId?: string | null
  action: RecoveryAction
  merchantId: string
  amountAtRisk: number
  recoveryProbability: number
  /** Customer ID — required for DND and contact frequency checks. */
  customerId?: string | null
  /** Idempotency key for communication deduplication. */
  idempotencyKey?: string
}

/**
 * Check whether a recovery action is eligible for execution.
 * Returns a GateResult with eligibility, reason, and approval requirement.
 *
 * Enforcement order:
 *   1. Case existence
 *   2. Terminal case state / payment already captured
 *   3. DND / opt-out (HARD gate)
 *   4. Contact frequency cap
 *   5. Decision validity
 *   6. Amount validity
 *   7. Recovery probability minimum
 *   8. Retry limit
 *   9. Duplicate detection
 *   10. Cooldown
 *   11. Approval requirement
 */
export async function checkExecutionGate(input: GateInput): Promise<GateResult> {
  const { caseId, decisionId, action, merchantId, amountAtRisk, recoveryProbability, customerId, idempotencyKey } = input

  // 1. Load the case
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { id: caseId },
    include: { payment: { select: { externalId: true, status: true, customerId: true } } },
  })

  if (!recoveryCase) {
    return { eligible: false, reason: `RecoveryCase ${caseId} not found`, requiresApproval: false }
  }

  // Resolve customer ID from input or from case's payment
  const effectiveCustomerId = customerId ?? recoveryCase.payment?.customerId ?? null

  // 2. Case must be in an open state
  if ((TERMINAL_CASE_STATUSES as readonly string[]).includes(recoveryCase.status)) {
    return { eligible: false, reason: STOP_REASONS.CASE_ALREADY_RECOVERED, requiresApproval: false }
  }

  // 3. If the case's linked payment is now captured, stop
  if (recoveryCase.payment?.status === 'captured') {
    return { eligible: false, reason: STOP_REASONS.CASE_ALREADY_RECOVERED, requiresApproval: false }
  }

  // --- DND + Contact Frequency (only for customer-facing actions) ---
  if (effectiveCustomerId && CUSTOMER_FACING_ACTIONS.has(action)) {
    // 4. DND / opt-out check (HARD gate — no bypass)
    const channel = ACTION_DEFAULT_CHANNEL[action] ?? 'email'
    const dndResult = await checkDNDEligibility({
      customerId: effectiveCustomerId,
      merchantId,
      channel: channel as 'email',
      caseId,
    })

    if (!dndResult.allowed) {
      return {
        eligible: false,
        reason: `DO_NOT_CONTACT: ${dndResult.reason}`,
        requiresApproval: false,
      }
    }

    // 5. Contact frequency cap
    if (idempotencyKey) {
      const contactResult = await checkContactEligibility({
        customerId: effectiveCustomerId,
        merchantId,
        action,
        channel,
        caseId,
        idempotencyKey,
      })

      if (!contactResult.allowed) {
        return {
          eligible: false,
          reason: `CONTACT_FREQUENCY_LIMIT: ${contactResult.reason}`,
          requiresApproval: false,
        }
      }
    }
  }

  // 6. Load decision if provided
  if (decisionId) {
    const decision = await db.agentDecision.findUnique({
      where: { id: decisionId },
    })

    if (!decision) {
      return { eligible: false, reason: STOP_REASONS.DECISION_EXPIRED, requiresApproval: false }
    }

    if (decision.status === 'rejected') {
      return { eligible: false, reason: 'Decision was rejected by policy', requiresApproval: false }
    }

    if (decision.status === 'expired') {
      return { eligible: false, reason: STOP_REASONS.DECISION_EXPIRED, requiresApproval: false }
    }

    // Time-based expiry
    const decisionAge = (Date.now() - decision.createdAt.getTime()) / 60_000
    if (decisionAge > DECISION_EXPIRY_MINUTES) {
      // Mark as expired in DB
      await db.agentDecision.update({
        where: { id: decisionId },
        data: { status: 'expired' },
      })
      return { eligible: false, reason: STOP_REASONS.DECISION_EXPIRED, requiresApproval: false }
    }

    // Decision must belong to this case
    if (decision.recoveryCaseId !== caseId) {
      return { eligible: false, reason: 'Decision does not belong to this case', requiresApproval: false }
    }
  }

  // 7. Amount validity
  if (amountAtRisk <= 0) {
    return { eligible: false, reason: STOP_REASONS.INVALID_AMOUNT, requiresApproval: false }
  }

  if (amountAtRisk < DEFAULT_MERCHANT_POLICY.minimumRecoveryAmount) {
    return { eligible: false, reason: `Amount ₹${(amountAtRisk / 100).toFixed(2)} below minimum ${DEFAULT_MERCHANT_POLICY.minimumRecoveryAmount / 100}`, requiresApproval: false }
  }

  // 8. Recovery probability minimum
  if (recoveryProbability < DEFAULT_MERCHANT_POLICY.minimumRecoveryProbability) {
    return { eligible: false, reason: `Recovery probability ${(recoveryProbability * 100).toFixed(0)}% below minimum ${(DEFAULT_MERCHANT_POLICY.minimumRecoveryProbability * 100).toFixed(0)}%`, requiresApproval: false }
  }

  // 9. Count existing attempts for this case
  const existingAttempts = await db.recoveryAttempt.count({
    where: { recoveryCaseId: caseId },
  })

  // 10. Retry limit
  if (existingAttempts >= DEFAULT_MERCHANT_POLICY.maxRecoveryAttempts) {
    return { eligible: false, reason: STOP_REASONS.RETRY_LIMIT_REACHED, requiresApproval: false }
  }

  // 11. Check for duplicate: same case + same action + non-terminal attempt
  const duplicateAttempt = await db.recoveryAttempt.findFirst({
    where: {
      recoveryCaseId: caseId,
      action,
      status: { in: ['pending', 'queued', 'running'] },
    },
  })

  if (duplicateAttempt) {
    return { eligible: false, reason: STOP_REASONS.DUPLICATE_ATTEMPT, requiresApproval: false }
  }

  // 12. Cooldown check
  if (action === 'retry_payment' || action === 'send_reminder') {
    const lastAttempt = await db.recoveryAttempt.findFirst({
      where: { recoveryCaseId: caseId },
      orderBy: { attemptedAt: 'desc' },
      select: { attemptedAt: true },
    })

    if (lastAttempt && DEFAULT_MERCHANT_POLICY.retryCooldownMinutes > 0) {
      const elapsed = (Date.now() - lastAttempt.attemptedAt.getTime()) / 60_000
      if (elapsed < DEFAULT_MERCHANT_POLICY.retryCooldownMinutes) {
        return { eligible: false, reason: STOP_REASONS.COOLDOWN_ACTIVE, requiresApproval: false }
      }
    }
  }

  // 13. Determine if merchant approval is required
  const requiresApproval = checkApprovalRequirement(action)

  return { eligible: true, reason: null, requiresApproval }
}

/** Check whether an action requires explicit merchant approval. */
function checkApprovalRequirement(action: RecoveryAction): boolean {
  switch (action) {
    case 'retry_payment':
    case 'offer_discount':
    case 'cancel_and_refund':
      return true
    default:
      return false
  }
}
