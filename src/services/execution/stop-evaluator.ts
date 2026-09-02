import { db } from "@/lib/db"
import { STOP_REASONS, type StopReason, DECISION_EXPIRY_MINUTES } from "./types"
import { TERMINAL_CASE_STATUSES } from "@/services/recovery/detection/constants"
import { checkDNDEligibility } from "@/services/dnd"
import { checkContactEligibility, CUSTOMER_FACING_ACTIONS, ACTION_DEFAULT_CHANNEL } from "@/services/contact-policy"
import { getConsentStatus } from "@/services/consent"
import { DEFAULT_MERCHANT_POLICY } from "@/services/recovery/agent/policy"
import type { RecoveryAction } from "@prisma/client"

export interface StopEvaluationResult {
  shouldStop: boolean
  reason: StopReason | null
  rule: string
  details?: Record<string, unknown>
}

export async function evaluateStoppingRules(
  caseId: string,
  action?: RecoveryAction,
  decisionId?: string | null,
  attemptId?: string | null
): Promise<StopEvaluationResult> {
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { id: caseId },
    include: { payment: true }
  })

  if (!recoveryCase) {
    return { shouldStop: true, reason: STOP_REASONS.CASE_STATE_INVALID, rule: "Case not found" }
  }

  // 1. Case already recovered?
  if ((TERMINAL_CASE_STATUSES as readonly string[]).includes(recoveryCase.status)) {
    return { shouldStop: true, reason: STOP_REASONS.CASE_ALREADY_RECOVERED, rule: "Terminal case status", details: { status: recoveryCase.status } }
  }

  // 2. Customer paid?
  if (recoveryCase.payment?.status === "captured") {
    return { shouldStop: true, reason: STOP_REASONS.CUSTOMER_PAID, rule: "Payment captured" }
  }

  const customerId = recoveryCase.payment?.customerId

  // Communication logic
  if (action && customerId && CUSTOMER_FACING_ACTIONS.has(action)) {
    const channel = ACTION_DEFAULT_CHANNEL[action] ?? "email"

    // 4. DND / Opt-out?
    const dndResult = await checkDNDEligibility({
      customerId,
      merchantId: recoveryCase.merchantId,
      channel: channel as any,
      caseId
    })
    
    if (!dndResult.allowed) {
      return { shouldStop: true, reason: STOP_REASONS.CUSTOMER_DND, rule: "Global DND or Opt-out", details: { dndReason: dndResult.reason } }
    }

    // Consent check
    const consent = await getConsentStatus(customerId, channel)
    if (consent === "WITHDRAWN") {
      return { shouldStop: true, reason: STOP_REASONS.CUSTOMER_OPTED_OUT, rule: "Consent withdrawn", details: { channel } }
    } else if (consent === "UNKNOWN") {
      // In phase 5, if unknown we block for strict compliance.
      return { shouldStop: true, reason: STOP_REASONS.CUSTOMER_OPTED_OUT, rule: "Consent unknown", details: { channel } }
    }

    // 5. Contact limit
    const contactResult = await checkContactEligibility({
      customerId,
      merchantId: recoveryCase.merchantId,
      action,
      channel,
      caseId,
      idempotencyKey: `stop-eval-${caseId}-${action}`
    })
    if (!contactResult.allowed) {
      return { shouldStop: true, reason: STOP_REASONS.CONTACT_LIMIT_REACHED, rule: "Frequency cap", details: { contactReason: contactResult.reason } }
    }
  }

  // 6. Attempt Limit
  const existingAttemptsCount = await db.recoveryAttempt.count({
    where: { recoveryCaseId: caseId }
  })
  
  if (!attemptId && existingAttemptsCount >= DEFAULT_MERCHANT_POLICY.maxRecoveryAttempts) {
    return { shouldStop: true, reason: STOP_REASONS.MAX_ATTEMPTS_REACHED, rule: "Attempt limit exceeded" }
  } else if (attemptId && existingAttemptsCount > DEFAULT_MERCHANT_POLICY.maxRecoveryAttempts) {
    return { shouldStop: true, reason: STOP_REASONS.MAX_ATTEMPTS_REACHED, rule: "Attempt limit exceeded" }
  }

  // 7. Cooldown
  if (action === "retry_payment" || action === "send_reminder") {
    const lastAttempt = await db.recoveryAttempt.findFirst({
      where: { recoveryCaseId: caseId, id: { not: attemptId || undefined } },
      orderBy: { attemptedAt: "desc" },
    })
    if (lastAttempt && DEFAULT_MERCHANT_POLICY.retryCooldownMinutes > 0) {
      const elapsed = (Date.now() - lastAttempt.attemptedAt.getTime()) / 60_000
      if (elapsed < DEFAULT_MERCHANT_POLICY.retryCooldownMinutes) {
        return { shouldStop: true, reason: STOP_REASONS.COOLDOWN_ACTIVE, rule: "Cooldown active" }
      }
    }
  }

  // 8. Decision expired
  if (decisionId) {
    const decision = await db.agentDecision.findUnique({ where: { id: decisionId } })
    if (!decision) return { shouldStop: true, reason: STOP_REASONS.DECISION_EXPIRED, rule: "Decision not found" }
    if (decision.status === "rejected") return { shouldStop: true, reason: STOP_REASONS.POLICY_BLOCKED, rule: "Decision rejected" }
    if (decision.status === "expired") return { shouldStop: true, reason: STOP_REASONS.DECISION_EXPIRED, rule: "Decision expired" }
    
    const ageMinutes = (Date.now() - decision.createdAt.getTime()) / 60_000
    if (ageMinutes > DECISION_EXPIRY_MINUTES) {
      await db.agentDecision.update({ where: { id: decisionId }, data: { status: "expired" } })
      return { shouldStop: true, reason: STOP_REASONS.DECISION_EXPIRED, rule: "Decision aged out" }
    }
  }

  // 9. Check for duplicate: same case + same action + non-terminal attempt
  if (action && !attemptId) {
    const duplicateAttempt = await db.recoveryAttempt.findFirst({
      where: {
        recoveryCaseId: caseId,
        action,
        status: { in: ['pending', 'queued', 'running'] },
      },
    })
    if (duplicateAttempt) {
      return { shouldStop: true, reason: STOP_REASONS.DUPLICATE_ATTEMPT, rule: "Duplicate execution attempt detected" }
    }
  }

  return { shouldStop: false, reason: null, rule: "" }
}
