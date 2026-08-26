/**
 * Execution Gate — validates eligibility before queuing.
 *
 * This is the last deterministic check before a job enters the queue.
 * The gate enforces:
 *   - Case state validity
 *   - Decision freshness and status
 *   - Policy compliance (retry limits, cooldowns, allowed actions)
 *   - Amount validity
 *   - Idempotency (no duplicate attempts)
 *
 * If the gate blocks, the attempt is NOT queued.
 */

import { db } from "@/lib/db"
import { OPEN_CASE_STATUSES, TERMINAL_CASE_STATUSES } from "@/services/recovery/detection/constants"
import { DEFAULT_MERCHANT_POLICY } from "@/services/recovery/agent/policy"
import type { RecoveryAction } from "@prisma/client"
import type { GateResult } from "./types"
import { STOP_REASONS, DECISION_EXPIRY_MINUTES } from "./types"

export interface GateInput {
  caseId: string
  decisionId?: string | null
  action: RecoveryAction
  merchantId: string
  amountAtRisk: number
  recoveryProbability: number
}

/**
 * Check whether a recovery action is eligible for execution.
 * Returns a GateResult with eligibility, reason, and approval requirement.
 */
export async function checkExecutionGate(input: GateInput): Promise<GateResult> {
  const { caseId, decisionId, action, merchantId, amountAtRisk, recoveryProbability } = input

  // 1. Load the case
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { id: caseId },
    include: { payment: { select: { externalId: true, status: true } } },
  })

  if (!recoveryCase) {
    return { eligible: false, reason: `RecoveryCase ${caseId} not found`, requiresApproval: false }
  }

  // 2. Case must be in an open state
  if ((TERMINAL_CASE_STATUSES as readonly string[]).includes(recoveryCase.status)) {
    return { eligible: false, reason: STOP_REASONS.CASE_ALREADY_RECOVERED, requiresApproval: false }
  }

  // 3. If the case's linked payment is now captured, stop
  if (recoveryCase.payment?.status === "captured") {
    return { eligible: false, reason: STOP_REASONS.CASE_ALREADY_RECOVERED, requiresApproval: false }
  }

  // 4. Load decision if provided
  if (decisionId) {
    const decision = await db.agentDecision.findUnique({
      where: { id: decisionId },
    })

    if (!decision) {
      return { eligible: false, reason: STOP_REASONS.DECISION_EXPIRED, requiresApproval: false }
    }

    if (decision.status === "rejected") {
      return { eligible: false, reason: "Decision was rejected by policy", requiresApproval: false }
    }

    if (decision.status === "expired") {
      return { eligible: false, reason: STOP_REASONS.DECISION_EXPIRED, requiresApproval: false }
    }

    // Time-based expiry
    const decisionAge = (Date.now() - decision.createdAt.getTime()) / 60_000
    if (decisionAge > DECISION_EXPIRY_MINUTES) {
      // Mark as expired in DB
      await db.agentDecision.update({
        where: { id: decisionId },
        data: { status: "expired" },
      })
      return { eligible: false, reason: STOP_REASONS.DECISION_EXPIRED, requiresApproval: false }
    }

    // Decision must belong to this case
    if (decision.recoveryCaseId !== caseId) {
      return { eligible: false, reason: "Decision does not belong to this case", requiresApproval: false }
    }
  }

  // 5. Amount validity
  if (amountAtRisk <= 0) {
    return { eligible: false, reason: STOP_REASONS.INVALID_AMOUNT, requiresApproval: false }
  }

  if (amountAtRisk < DEFAULT_MERCHANT_POLICY.minimumRecoveryAmount) {
    return { eligible: false, reason: `Amount ₹${(amountAtRisk / 100).toFixed(2)} below minimum ${DEFAULT_MERCHANT_POLICY.minimumRecoveryAmount / 100}`, requiresApproval: false }
  }

  // 6. Recovery probability minimum
  if (recoveryProbability < DEFAULT_MERCHANT_POLICY.minimumRecoveryProbability) {
    return { eligible: false, reason: `Recovery probability ${(recoveryProbability * 100).toFixed(0)}% below minimum ${(DEFAULT_MERCHANT_POLICY.minimumRecoveryProbability * 100).toFixed(0)}%`, requiresApproval: false }
  }

  // 7. Count existing attempts for this case
  const existingAttempts = await db.recoveryAttempt.count({
    where: { recoveryCaseId: caseId },
  })

  // 8. Retry limit
  if (existingAttempts >= DEFAULT_MERCHANT_POLICY.maxRecoveryAttempts) {
    return { eligible: false, reason: STOP_REASONS.RETRY_LIMIT_REACHED, requiresApproval: false }
  }

  // 9. Check for duplicate: same case + same action + non-terminal attempt
  const duplicateAttempt = await db.recoveryAttempt.findFirst({
    where: {
      recoveryCaseId: caseId,
      action,
      status: { in: ["pending", "queued", "running"] },
    },
  })

  if (duplicateAttempt) {
    return { eligible: false, reason: STOP_REASONS.DUPLICATE_ATTEMPT, requiresApproval: false }
  }

  // 10. Cooldown check
  if (action === "retry_payment" || action === "send_reminder") {
    const lastAttempt = await db.recoveryAttempt.findFirst({
      where: { recoveryCaseId: caseId },
      orderBy: { attemptedAt: "desc" },
      select: { attemptedAt: true },
    })

    if (lastAttempt && DEFAULT_MERCHANT_POLICY.retryCooldownMinutes > 0) {
      const elapsed = (Date.now() - lastAttempt.attemptedAt.getTime()) / 60_000
      if (elapsed < DEFAULT_MERCHANT_POLICY.retryCooldownMinutes) {
        return { eligible: false, reason: STOP_REASONS.COOLDOWN_ACTIVE, requiresApproval: false }
      }
    }
  }

  // 11. Determine if merchant approval is required
  const requiresApproval = checkApprovalRequirement(action)

  return { eligible: true, reason: null, requiresApproval }
}

/** Check whether an action requires explicit merchant approval. */
function checkApprovalRequirement(action: RecoveryAction): boolean {
  // High-value amounts always require approval regardless of action
  // (handled separately at the API layer via policy)
  switch (action) {
    case "retry_payment":
    case "offer_discount":
    case "cancel_and_refund":
      return true
    default:
      return false
  }
}
