/**
 * RecoveryCase lifecycle service.
 *
 * Handles idempotent case creation, updates, and status transitions.
 * The detection engine calls this — never the API routes directly.
 */

import { db } from "@/lib/db"
import { logAudit } from "@/services/audit/log"
import { OPEN_CASE_STATUSES, TERMINAL_CASE_STATUSES } from "./detection/constants"
import type { RiskSource, RecoveryScore } from "./detection/types"
import type { RiskCategory, Priority, RecoveryCaseStatus } from "@prisma/client"

export interface CreateCaseParams {
  merchantId: string
  customerId: string
  source: RiskSource
  sourceId: string
  amountAtRisk: number
  currency: string
  category: RiskCategory
  priority: Priority
  score: RecoveryScore
  failureReason: string
  detectedAt?: Date
}

/**
 * Idempotently create a RecoveryCase.
 *
 * For payments: uses @unique paymentId to guarantee no duplicates.
 * For checkouts/subscriptions: checks for existing open case first.
 *
 * Returns the case (new or existing) and whether it was newly created.
 */
export async function createRecoveryCase(params: CreateCaseParams): Promise<{
  recoveryCase: { id: string }
  created: boolean
}> {
  // 1. Check for existing case based on source
  if (params.source === "payment") {
    const existing = await db.recoveryCase.findUnique({
      where: { paymentId: params.sourceId },
    })
    if (existing) {
      return { recoveryCase: { id: existing.id }, created: false }
    }
  }

  if (params.source === "checkout" || params.source === "subscription") {
    const field = params.source === "checkout" ? "checkoutId" : "subscriptionId"
    const existing = await db.recoveryCase.findFirst({
      where: {
        [field]: params.sourceId,
        status: { in: [...OPEN_CASE_STATUSES] },
      },
    })
    if (existing) {
      return { recoveryCase: { id: existing.id }, created: false }
    }
  }

  // 2. Create the case
  const linkField =
    params.source === "payment"
      ? { paymentId: params.sourceId }
      : params.source === "checkout"
        ? { checkoutId: params.sourceId }
        : { subscriptionId: params.sourceId }

  const recoveryCase = await db.recoveryCase.create({
    data: {
      merchantId: params.merchantId,
      amountAtRisk: params.amountAtRisk,
      currency: params.currency,
      category: params.category,
      priority: params.priority,
      status: "detected",
      recoveryProbability: params.score.score / 100,
      recoveredAmount: 0,
      detectedAt: params.detectedAt ?? new Date(),
      ...linkField,
    },
  })

  // 3. Audit
  await logAudit({
    caseId: recoveryCase.id,
    actor: { type: "system" },
    eventType: "recovery_case.detected",
    entityType: "recovery_case",
    entityId: recoveryCase.id,
    action: "detected",
    details: [
      `Revenue at risk detected: ${params.category}`,
      `Amount: ₹${(params.amountAtRisk / 100).toLocaleString("en-IN")}`,
      `Priority: ${params.priority} (score: ${params.score.score}/100)`,
      `Source: ${params.source}:${params.sourceId}`,
      `Failure: ${params.failureReason || "N/A"}`,
    ].join(" | "),
    metadata: {
      source: params.source,
      sourceId: params.sourceId,
      category: params.category,
      priority: params.priority,
      amountAtRisk: params.amountAtRisk,
      score: params.score.score,
      confidence: params.score.confidence,
      factors: params.score.factors.map((f) => ({
        name: f.name,
        points: f.points,
        detail: f.detail,
      })),
      failureReason: params.failureReason,
    },
  })

  return { recoveryCase: { id: recoveryCase.id }, created: true }
}

// --- Status helpers ------------------------------------------------------

export function isOpenStatus(status: string): boolean {
  return (OPEN_CASE_STATUSES as readonly string[]).includes(status)
}

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_CASE_STATUSES as readonly string[]).includes(status)
}

/**
 * Map our conceptual lifecycle to RecoveryCaseStatus.
 * OPEN → detected
 * IN_PROGRESS → diagnosing
 * RECOVERED → completed
 * UNRECOVERABLE → failed
 * STOPPED → dismissed
 */
export const LIFECYCLE_MAP = {
  OPEN: "detected" as RecoveryCaseStatus,
  IN_PROGRESS: "diagnosing" as RecoveryCaseStatus,
  RECOVERED: "completed" as RecoveryCaseStatus,
  UNRECOVERABLE: "failed" as RecoveryCaseStatus,
  STOPPED: "dismissed" as RecoveryCaseStatus,
}
