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
import { evaluateStoppingRules } from './stop-evaluator'

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

  // 1. Load the case and merchant
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { id: caseId },
    include: { 
      payment: { select: { externalId: true, status: true, customerId: true } },
      merchant: { select: { autonomyLevel: true } }
    },
  })

  if (!recoveryCase) {
    return { eligible: false, reason: `RecoveryCase ${caseId} not found`, requiresApproval: false }
  }

  const stopResult = await evaluateStoppingRules(caseId, action, decisionId, null)
  if (stopResult.shouldStop) {
    return { eligible: false, reason: stopResult.reason ?? stopResult.rule, requiresApproval: false }
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

  // 13. Determine if merchant approval is required based on autonomy level
  const autonomyLevel = recoveryCase.merchant.autonomyLevel ?? 2
  const requiresApproval = checkApprovalRequirement(action, autonomyLevel)

  return { eligible: true, reason: null, requiresApproval }
}

/** Check whether an action requires explicit merchant approval based on autonomy level. */
function checkApprovalRequirement(action: RecoveryAction, autonomyLevel: number): boolean {
  // L0 (Observe) and L1 (Manual) require approval for everything
  if (autonomyLevel <= 1) return true

  // L3 (Autonomous) and L4 (Max) do not require approval for any standard actions
  if (autonomyLevel >= 3) return false

  // L2 (Supervised) requires approval only for high-risk financial actions
  switch (action) {
    case 'retry_payment':
    case 'offer_discount':
    case 'cancel_and_refund':
      return true
    default:
      return false
  }
}
