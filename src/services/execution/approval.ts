/**
 * Approval service for AgentDecisions.
 *
 * Some actions (retry_payment, payment_link, offer_discount, cancel_and_refund) require
 * explicit merchant approval before execution. This service handles
 * the approve/reject workflow with full audit trail.
 */

import { db } from "@/lib/db"
import { logAudit } from "@/services/audit/log"
import { TERMINAL_CASE_STATUSES } from "@/services/recovery/detection/constants"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { validateDecisionTransition } from "@/lib/state-machine"
import type { ApprovalResult } from "./types"

export interface ApproveDecisionParams {
  decisionId: string
  merchantId: string
  /** Optional note from the merchant about the approval. */
  note?: string
}

/**
 * Approve an AgentDecision that requires merchant sign-off.
 * Only pending decisions can be approved.
 */
export async function approveDecision(params: ApproveDecisionParams): Promise<ApprovalResult> {
  const { decisionId, merchantId, note } = params
  const log = logger.child({ decisionId, merchantId })

  // 1. Load the decision with its case
  const decision = await db.agentDecision.findUnique({
    where: { id: decisionId },
    include: {
      recoveryCase: {
        include: { merchant: { select: { id: true } } },
      },
    },
  })

  if (!decision) {
    throw new NotFoundError(`AgentDecision ${decisionId} not found`)
  }

  // 2. Validate decision status via central state machine
  try {
    validateDecisionTransition(decisionId, decision.status, "approved")
  } catch (err) {
    throw new ValidationError(
      `Decision is in '${decision.status}' status — only 'pending' decisions can be approved`
    )
  }

  // 3. Validate case is still open
  if ((TERMINAL_CASE_STATUSES as readonly string[]).includes(decision.recoveryCase.status)) {
    throw new ValidationError(`Case is in terminal state '${decision.recoveryCase.status}' — cannot approve`)
  }

  // 4. Update decision
  const updated = await db.agentDecision.update({
    where: { id: decisionId },
    data: {
      status: "approved",
      reviewedBy: merchantId,
      reviewedAt: new Date(),
    },
  })

  log.info("Decision approved", { action: updated.recommendedAction, confidence: updated.confidence })

  // 5. Audit
  await logAudit({
    caseId: decision.recoveryCaseId,
    actor: { type: "merchant", merchantId },
    eventType: "RECOVERY_ACTION_APPROVED",
    entityType: "agent_decision",
    entityId: decisionId,
    action: updated.recommendedAction,
    details: [
      `Merchant approved action: ${updated.recommendedAction}`,
      `Confidence: ${(updated.confidence * 100).toFixed(0)}%`,
      note ? `Note: ${note}` : null,
    ].filter(Boolean).join(" | "),
    metadata: {
      decisionId,
      recommendedAction: updated.recommendedAction,
      confidence: updated.confidence,
      merchantId,
      note,
    },
  })

  return {
    decisionId,
    caseId: decision.recoveryCaseId,
    action: updated.recommendedAction,
    status: "approved",
    reason: note,
  }
}

export interface RejectDecisionParams {
  decisionId: string
  merchantId: string
  /** Why the merchant rejected this. */
  reason?: string
}

/**
 * Reject an AgentDecision.
 * Only pending decisions can be rejected.
 */
export async function rejectDecision(params: RejectDecisionParams): Promise<ApprovalResult> {
  const { decisionId, merchantId, reason } = params
  const log = logger.child({ decisionId, merchantId })

  // 1. Load the decision
  const decision = await db.agentDecision.findUnique({
    where: { id: decisionId },
    include: { recoveryCase: true },
  })

  if (!decision) {
    throw new NotFoundError(`AgentDecision ${decisionId} not found`)
  }

  // 2. Validate status via central state machine
  try {
    validateDecisionTransition(decisionId, decision.status, "rejected")
  } catch (err) {
    throw new ValidationError(
      `Decision is in '${decision.status}' status — only 'pending' decisions can be rejected`
    )
  }

  // 3. Update
  const updated = await db.agentDecision.update({
    where: { id: decisionId },
    data: {
      status: "rejected",
      reviewedBy: merchantId,
      reviewedAt: new Date(),
    },
  })

  log.info("Decision rejected", { action: updated.recommendedAction, reason })

  // 4. Audit
  await logAudit({
    caseId: decision.recoveryCaseId,
    actor: { type: "merchant", merchantId },
    eventType: "RECOVERY_ACTION_REJECTED",
    entityType: "agent_decision",
    entityId: decisionId,
    action: updated.recommendedAction,
    details: [
      `Merchant rejected action: ${updated.recommendedAction}`,
      reason ? `Reason: ${reason}` : null,
    ].filter(Boolean).join(" | "),
    metadata: {
      decisionId,
      recommendedAction: updated.recommendedAction,
      merchantId,
      reason,
    },
  })

  return {
    decisionId,
    caseId: decision.recoveryCaseId,
    action: updated.recommendedAction,
    status: "rejected",
    reason,
  }
}