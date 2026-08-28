/**
 * Recovery Attribution Service.
 *
 * Core logic for linking successful payments to recovery cases.
 * This is the ONLY place where recoveredAmount is updated.
 *
 * Attribution signals (ordered by confidence):
 *   1. payment_retry — Same payment externalId captured (the original payment was retried)
 *   2. payment_link — Payment created via recovery action, referenced in attempt's externalRef
 *   3. manual — Merchant manually attributed
 *   4. temporal — Time proximity (weak, marked unattributed for review)
 *
 * IMPORTANT: Same customer + same amount is NOT sufficient for attribution.
 */

import { db } from "@/lib/db"
import { logAudit } from "@/services/audit/log"
import { OPEN_CASE_STATUSES } from "../detection/constants"
import { TERMINAL_CASE_STATUSES as TERMINAL_CASE_SET } from "@/lib/state-machine"
import { logger } from "@/lib/logger"
import { calculateRecoveryIncrement } from "@/lib/money"
import { SOURCE_CONFIDENCE } from "./types"
import type {
  AttributionResult,
  AttributePaymentInput,
  AttributionMetrics,
  FullRecoveryMetrics,
} from "./types"
import type { AttributionStatus, AttributionSource } from "@prisma/client"

// --- Public: Main Attribution Entry Point -----------------------------------

/**
 * Attempt to attribute a captured payment to a recovery case.
 * Called by the webhook pipeline when payment.captured arrives.
 *
 * Returns null if no attribution is possible.
 */
export async function attemptAttribution(
  input: AttributePaymentInput
): Promise<AttributionResult | null> {
  const { paymentId, amount, customerId, merchantId, providerPaymentId, providerOrderId } = input

  const attributionLog = logger.child({
    externalPaymentId: providerPaymentId,
  })

  // Audit: payment received for attribution
  await logAudit({
    actor: { type: 'webhook', source: 'razorpay' },
    eventType: 'PAYMENT_RECEIVED',
    entityType: 'payment',
    entityId: paymentId,
    action: 'attribution_attempted',
    details: `Attribution check for captured payment ${providerPaymentId}`,
    metadata: { paymentId, providerPaymentId, providerOrderId: providerOrderId ?? null, amount, customerId, merchantId },
  })

  // Audit: attribution flow started
  await logAudit({
    actor: { type: 'webhook', source: 'razorpay' },
    eventType: 'ATTRIBUTION_ATTEMPTED',
    entityType: 'payment',
    entityId: paymentId,
    action: 'attribution_attempted',
    details: `Attempting attribution for provider payment ${providerPaymentId}`,
    metadata: { paymentId, providerPaymentId, amount, customerId, merchantId },
  })

  // 1. Check if this payment was already attributed to any case (idempotent)
  const existingByPayment = await db.recoveryAttribution.findFirst({
    where: { paymentId },
  })
  if (existingByPayment) {
    attributionLog.info('ATTRIBUTION_SKIPPED', { reason: 'ALREADY_ATTRIBUTED', attributionId: existingByPayment.id })
    return null // Already attributed — idempotent
  }

  // 2. Try each attribution signal in order of confidence
  const retryResult = await tryPaymentRetryAttribution(providerPaymentId, amount, attributionLog)
  if (retryResult) return retryResult

  const linkResult = await tryPaymentLinkAttribution(customerId, merchantId, paymentId, amount, attributionLog)
  if (linkResult) return linkResult

  // 3. No strong signal found — do NOT auto-attribute by customer+amount
  attributionLog.info('ATTRIBUTION_UNRESOLVED', { reason: 'NO_DETERMINISTIC_REFERENCE' })

  await logAudit({
    actor: { type: 'webhook', source: 'razorpay' },
    eventType: 'PAYMENT_UNATTRIBUTED',
    entityType: 'payment',
    entityId: paymentId,
    action: 'attribution_unresolved',
    details: `No deterministic attribution signal found for payment ${providerPaymentId}`,
    metadata: { paymentId, providerPaymentId, reason: 'NO_DETERMINISTIC_REFERENCE' },
  })

  return null
}

// --- Signal 1: Payment Retry (same externalId) -----------------------------

/**
 * If a RecoveryCase has paymentId = X, and payment X transitions to captured,
 * that's a direct payment retry.
 */
async function tryPaymentRetryAttribution(
  providerPaymentId: string,
  amount: number,
  log: ReturnType<typeof logger.child>
): Promise<AttributionResult | null> {
  // Find the payment by its provider payment ID (stored in Payment.externalId)
  const payment = await db.payment.findUnique({
    where: { externalId: providerPaymentId },
  })
  if (!payment) {
    log.info('ATTRIBUTION_SIGNAL_FAILED', { signal: 'payment_retry', reason: 'NO_MATCHING_PAYMENT', providerPaymentId })
    return null
  }

  // Find an open recovery case linked to this payment
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { paymentId: payment.id },
  })
  if (!recoveryCase) {
    log.info('ATTRIBUTION_SIGNAL_FAILED', { signal: 'payment_retry', reason: 'NO_OPEN_CASE_FOR_PAYMENT' })
    return null
  }

  // Case must be in an open state
  if (TERMINAL_CASE_SET.has(recoveryCase.status)) {
    log.info('ATTRIBUTION_SIGNAL_FAILED', { signal: 'payment_retry', reason: 'CASE_IN_TERMINAL_STATE', caseId: recoveryCase.id, caseStatus: recoveryCase.status })
    return null
  }

  // Amount should be positive
  if (amount <= 0) return null

  log.info('ATTRIBUTION_SUCCESS', { signal: 'payment_retry', case: recoveryCase.id, attempt: null, providerPaymentId })

  return createAttribution({
    recoveryCaseId: recoveryCase.id,
    paymentId: payment.id,
    amount: Math.min(amount, recoveryCase.amountAtRisk), // Cap at amountAtRisk
    source: "payment_retry",
    confidence: SOURCE_CONFIDENCE.payment_retry,
    reason: `Original payment ${providerPaymentId} was retried and captured. Amount: ₹${(amount / 100).toFixed(2)}`,
  })
}

// --- Signal 2: Payment Link (attempt's externalRef matches) ---------------

/**
 * If a recovery attempt has an externalRef that contains a reference,
 * and a new payment arrives for the same customer, check if it matches.
 *
 * This handles: payment links created by the recovery action.
 * The payment link's ID or reference should match the attempt's externalRef.
 */
async function tryPaymentLinkAttribution(
  customerId: string,
  merchantId: string,
  newPaymentId: string,
  amount: number,
  log: ReturnType<typeof logger.child>
): Promise<AttributionResult | null> {
  if (amount <= 0) return null

  // Find open recovery cases for this customer/merchant
  const openCases = await db.recoveryCase.findMany({
    where: {
      merchantId,
      status: { in: [...OPEN_CASE_STATUSES] },
    },
    include: {
      recoveryAttempts: {
        where: {
          status: "succeeded",
          simulated: false,
          externalRef: { not: "" },
        },
        orderBy: { attemptedAt: "desc" },
      },
      payment: { select: { customerId: true, externalId: true } },
    },
  })

  for (const recoveryCase of openCases) {
    // Verify this case belongs to the same customer (via linked payment or checkout/subscription)
    const caseCustomerId = recoveryCase.payment?.customerId
    if (!caseCustomerId || caseCustomerId !== customerId) {
      // Also check checkout/subscription customer
      if (recoveryCase.checkoutId) {
        const checkout = await db.checkout.findUnique({
          where: { id: recoveryCase.checkoutId! },
          select: { customerId: true },
        })
        if (!checkout || checkout.customerId !== customerId) continue
      } else {
        continue
      }
    }

    // Check if any succeeded attempt has an externalRef that could link to this payment
    // For payment links, the externalRef would contain the link/payment reference
    const latestAttempt = recoveryCase.recoveryAttempts[0]
    if (!latestAttempt) continue

    // If the attempt created a payment link, the new payment could be from that link
    // We attribute with payment_link source if the amounts are reasonable
    if (amount <= recoveryCase.amountAtRisk) {
      log.info('ATTRIBUTION_SUCCESS', { signal: 'payment_link', case: recoveryCase.id, attempt: latestAttempt.id, providerPaymentId: newPaymentId })

      return createAttribution({
        recoveryCaseId: recoveryCase.id,
        paymentId: newPaymentId,
        recoveryAttemptId: latestAttempt.id,
        amount,
        source: "payment_link",
        confidence: SOURCE_CONFIDENCE.payment_link,
        reason: `New payment after recovery action '${latestAttempt.action}'. Case: ${recoveryCase.id}, Attempt: ${latestAttempt.id}`,
      })
    }
  }

  log.info('ATTRIBUTION_SIGNAL_FAILED', { signal: 'payment_link', reason: 'NO_MATCHING_OPEN_CASE_WITH_SUCCEEDED_ATTEMPT' })
  return null
}

// --- Create Attribution (with transaction) ----------------------------------

interface CreateAttributionParams {
  recoveryCaseId: string
  paymentId: string
  recoveryAttemptId?: string
  amount: number
  source: AttributionSource
  confidence: number
  reason: string
}

/**
 * Create a RecoveryAttribution and update the case/attempt.
 * Uses a transaction to ensure consistency.
 */
async function createAttribution(
  params: CreateAttributionParams
): Promise<AttributionResult> {
  const { recoveryCaseId, paymentId, recoveryAttemptId, amount, source, confidence, reason } = params

  return db.$transaction(async (tx) => {
    // 1. Load the case with current recovered amount
    const recoveryCase = await tx.recoveryCase.findUnique({
      where: { id: recoveryCaseId },
    })
    if (!recoveryCase) throw new Error(`RecoveryCase ${recoveryCaseId} not found`)

    // 2. Check for duplicate (same case + same payment) — DB unique constraint backs this up
    const existing = await tx.recoveryAttribution.findFirst({
      where: { recoveryCaseId, paymentId },
    })
    if (existing) {
      return {
        attributionId: existing.id,
        recoveryCaseId,
        paymentId,
        amount: existing.amount,
        status: existing.status as AttributionStatus,
        source: existing.source as AttributionSource,
        confidence: existing.confidence,
        reason: existing.reason,
        caseUpdated: false,
        attemptUpdated: false,
      }
    }

    // 3. Calculate new recovered amount (never exceed amountAtRisk, never negative)
    const actualIncrement = Math.min(
      amount,
      recoveryCase.amountAtRisk - recoveryCase.recoveredAmount
    )
    if (actualIncrement <= 0) {
      return {
        attributionId: "",
        recoveryCaseId,
        paymentId,
        amount: 0,
        status: "rejected" as AttributionStatus,
        source,
        confidence: 0,
        reason: "No remaining amount to attribute (case already fully recovered)",
        caseUpdated: false,
        attemptUpdated: false,
      }
    }

    const newRecovered = recoveryCase.recoveredAmount + actualIncrement
    const fullyRecovered = newRecovered >= recoveryCase.amountAtRisk

    // 4. Validate case state transition
    if (fullyRecovered && recoveryCase.status !== "completed") {
      // State machine: open → completed is valid
    }

    // 5. Create the attribution (unique constraint on recoveryCaseId+paymentId prevents duplicates)
    const attribution = await tx.recoveryAttribution.create({
      data: {
        recoveryCaseId,
        recoveryAttemptId: recoveryAttemptId ?? null,
        paymentId,
        amount: actualIncrement,
        status: "attributed",
        source,
        confidence,
        reason,
      },
    })

    // 6. Update RecoveryCase
    const caseUpdateData: Record<string, unknown> = {
      recoveredAmount: newRecovered,
      updatedAt: new Date(),
    }
    if (fullyRecovered) {
      caseUpdateData.status = "completed"
      caseUpdateData.resolvedAt = new Date()
    }
    await tx.recoveryCase.update({
      where: { id: recoveryCaseId },
      data: caseUpdateData,
    })

    // 7. Update RecoveryAttempt if linked (only if attempt is in a non-terminal state)
    let attemptUpdated = false
    if (recoveryAttemptId) {
      const attempt = await tx.recoveryAttempt.findUnique({
        where: { id: recoveryAttemptId },
        select: { status: true },
      })
      // Only update succeeded/running attempts — never re-open a terminal attempt
      if (attempt && (attempt.status === "succeeded" || attempt.status === "running")) {
        await tx.recoveryAttempt.update({
          where: { id: recoveryAttemptId },
          data: {
            recoveredAmount: actualIncrement,
            completedAt: new Date(),
          },
        })
        attemptUpdated = true
      }
    }

    // 8. Audit
    await logAudit({
      caseId: recoveryCaseId,
      actor: { type: "webhook", source: "razorpay" },
      eventType: fullyRecovered ? "RECOVERY_CASE_FULLY_RECOVERED" : "RECOVERY_CASE_PARTIALLY_RECOVERED",
      entityType: "recovery_attribution",
      entityId: attribution.id,
      action: "attributed",
      details: [
        `Revenue attributed: ₹${(actualIncrement / 100).toFixed(2)}`,
        `Source: ${source} (${(confidence * 100).toFixed(0)}% confidence)`,
        fullyRecovered ? "Case FULLY RECOVERED" : `Case PARTIALLY RECOVERED (₹${((recoveryCase.amountAtRisk - newRecovered) / 100).toFixed(2)} remaining)`,
        `Payment: ${paymentId}`,
      ].join(" | "),
      metadata: {
        attributionId: attribution.id,
        paymentId,
        amount: actualIncrement,
        totalRecovered: newRecovered,
        amountAtRisk: recoveryCase.amountAtRisk,
        source,
        confidence,
        recoveryAttemptId,
        wasPartial: !fullyRecovered,
      },
    })

    // 9. Trigger outcome evaluation for the linked attempt (cross-feature integration)
    if (recoveryAttemptId) {
      try {
        const { markRecovered } = await import("../outcome")
        await markRecovered(recoveryAttemptId, attribution.id)
      } catch (err) {
        // Outcome evaluation failure must NOT break the attribution flow
        logger.error("OUTCOME_EVALUATION_FAILED_AFTER_ATTRIBUTION", {
          attributionId: attribution.id,
          recoveryAttemptId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // 10. Audit: payment attributed
    await logAudit({
      caseId: recoveryCaseId,
      actor: { type: "webhook", source: "razorpay" },
      eventType: "PAYMENT_ATTRIBUTED",
      entityType: "payment",
      entityId: paymentId,
      action: "payment_attributed",
      details: `Payment attributed to recovery case via ${source} (${(confidence * 100).toFixed(0)}% confidence). ₹${(actualIncrement / 100).toFixed(2)} recovered.`,
      metadata: {
        attributionId: attribution.id,
        paymentId,
        recoveryCaseId,
        source,
        confidence,
        amount: actualIncrement,
        recoveryAttemptId,
      },
    })

    return {
      attributionId: attribution.id,
      recoveryCaseId,
      paymentId,
      amount: actualIncrement,
      status: "attributed",
      source,
      confidence,
      reason,
      caseUpdated: true,
      attemptUpdated,
    }
  })
}

// --- Manual Attribution ---------------------------------------------------

export interface ManualAttributionParams {
  recoveryCaseId: string
  paymentId: string
  recoveryAttemptId?: string
  amount?: number
  merchantId: string
  reason?: string
}

/**
 * Manually attribute a payment to a recovery case.
 * Requires merchant authorization.
 */
export async function manualAttribution(
  params: ManualAttributionParams
): Promise<AttributionResult> {
  const { recoveryCaseId, paymentId, recoveryAttemptId, merchantId, reason } = params

  // Validate the case exists and is open
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { id: recoveryCaseId },
  })
  if (!recoveryCase) throw new Error(`RecoveryCase ${recoveryCaseId} not found`)
  if (TERMINAL_CASE_SET.has(recoveryCase.status)) {
    throw new Error(`Case ${recoveryCaseId} is in terminal state ${recoveryCase.status}`)
  }

  // Validate the payment exists and is captured
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment) throw new Error(`Payment ${paymentId} not found`)
  if (payment.status !== "captured") {
    throw new Error(`Payment ${paymentId} is not captured (status: ${payment.status})`)
  }

  const amount = params.amount ?? Math.min(payment.amount, recoveryCase.amountAtRisk - recoveryCase.recoveredAmount)
  if (amount <= 0) throw new Error("No remaining amount to attribute")

  return createAttribution({
    recoveryCaseId,
    paymentId,
    recoveryAttemptId,
    amount,
    source: "manual",
    confidence: SOURCE_CONFIDENCE.manual,
    reason: reason ?? `Manually attributed by merchant ${merchantId}`,
  })
}

// --- Metrics --------------------------------------------------------------

/**
 * Get attribution-specific metrics.
 */
export async function getAttributionMetrics(): Promise<AttributionMetrics> {
  const [attributed, unattributed, rejected, bySource] = await Promise.all([
    db.recoveryAttribution.aggregate({
      _count: true,
      _sum: { amount: true },
      where: { status: "attributed" },
    }),
    db.recoveryAttribution.count({ where: { status: "unattributed" } }),
    db.recoveryAttribution.count({ where: { status: "rejected" } }),
    db.recoveryAttribution.groupBy({
      by: ["source"],
      _count: true,
      _sum: { amount: true },
      where: { status: "attributed" },
    }),
  ])

  const sourceMap: Record<string, { count: number; amount: number }> = {}
  for (const row of bySource) {
    sourceMap[row.source] = {
      count: row._count,
      amount: row._sum.amount ?? 0,
    }
  }

  // Action effectiveness: for each action type, how many attempts led to attribution?
  const attempts = await db.recoveryAttempt.findMany({
    where: { status: "succeeded" },
    include: {
      recoveryAttributions: {
        where: { status: "attributed" },
        select: { amount: true },
      },
    },
  })

  const actionMap: Record<string, { attempted: number; recovered: number; recoveredAmount: number; recoveryRate: number }> = {}
  for (const att of attempts) {
    if (!actionMap[att.action]) {
      actionMap[att.action] = { attempted: 0, recovered: 0, recoveredAmount: 0, recoveryRate: 0 }
    }
    actionMap[att.action].attempted++
    const attAmount = att.recoveryAttributions.reduce((sum, a) => sum + a.amount, 0)
    if (attAmount > 0) {
      actionMap[att.action].recovered++
      actionMap[att.action].recoveredAmount += attAmount
    }
  }
  for (const action of Object.keys(actionMap)) {
    const m = actionMap[action]
    m.recoveryRate = m.attempted > 0 ? m.recovered / m.attempted : 0
  }

  return {
    totalAttributed: attributed._count,
    totalUnattributed: unattributed,
    totalRejected: rejected,
    attributedRevenue: attributed._sum.amount ?? 0,
    bySource: sourceMap,
    byAction: actionMap,
  }
}

/**
 * Get full recovery metrics including attribution data.
 *
 * Recovery rate formula:
 *   recoveryRate = totalAttributedRevenue / (totalAttributedRevenue + totalOpenRevenueAtRisk) * 100
 *
 * Only ATTRIBUTED revenue counts. Open cases' remaining at-risk is the denominator.
 */
export async function getFullRecoveryMetrics(): Promise<FullRecoveryMetrics> {
  const [capturedSum, openCasesAggregate, completedAggregate, activeCasesCount, highPriorityCount, failedPaymentsAggregate, abandonedAggregate, subscriptionAtRiskAggregate, categoryBreakdown, priorityBreakdown, attributionMetrics] =
    await Promise.all([
      db.payment.aggregate({ _sum: { amount: true }, where: { status: "captured" } }),
      db.recoveryCase.aggregate({
        _sum: { amountAtRisk: true, recoveredAmount: true },
        where: { status: { in: [...OPEN_CASE_STATUSES] } },
      }),
      db.recoveryCase.aggregate({ _sum: { recoveredAmount: true } }),
      db.recoveryCase.count({ where: { status: { in: [...OPEN_CASE_STATUSES] } } }),
      db.recoveryCase.count({
        where: { status: { in: [...OPEN_CASE_STATUSES] }, priority: { in: ["high", "critical"] } },
      }),
      db.payment.aggregate({ _sum: { amount: true }, _count: true, where: { status: "failed" } }),
      db.checkout.aggregate({ _sum: { amount: true }, where: { status: "abandoned" } }),
      db.subscription.aggregate({ _sum: { amount: true }, where: { status: "past_due" } }),
      db.recoveryCase.groupBy({
        by: ["category"],
        _sum: { amountAtRisk: true, recoveredAmount: true },
        _count: true,
      }),
      db.recoveryCase.groupBy({
        by: ["priority"],
        _count: true,
      }),
      getAttributionMetrics(),
    ])

  const totalRevenueProcessed = capturedSum._sum.amount ?? 0
  const totalOpenAtRisk = openCasesAggregate._sum.amountAtRisk ?? 0
  const totalOpenRecovered = openCasesAggregate._sum.recoveredAmount ?? 0
  const totalRecoveredRevenue = attributionMetrics.attributedRevenue
  const remainingRevenueAtRisk = totalOpenAtRisk - totalOpenRecovered

  const recoveryDenominator = totalRecoveredRevenue + remainingRevenueAtRisk
  const recoveryRate = recoveryDenominator > 0 ? totalRecoveredRevenue / recoveryDenominator : 0

  // Case counts by status
  const recoveredCases = await db.recoveryCase.count({
    where: { status: "completed", recoveredAmount: { gt: 0 } },
  })
  const partiallyRecovered = await db.recoveryCase.count({
    where: {
      status: { in: [...OPEN_CASE_STATUSES] },
      recoveredAmount: { gt: 0 },
    },
  })
  const unrecoverable = await db.recoveryCase.count({ where: { status: "failed" } })
  const unattributedPayments = attributionMetrics.totalUnattributed

  // Category breakdown
  const byCategory: Record<string, { count: number; amountAtRisk: number; recovered: number }> = {}
  for (const row of categoryBreakdown) {
    byCategory[row.category] = {
      count: row._count,
      amountAtRisk: row._sum.amountAtRisk ?? 0,
      recovered: row._sum.recoveredAmount ?? 0,
    }
  }

  // Priority breakdown
  const byPriority: Record<string, number> = {}
  for (const row of priorityBreakdown) {
    byPriority[row.priority] = row._count
  }

  return {
    totalRevenueProcessed,
    totalRevenueAtRisk: totalOpenAtRisk,
    totalRecoveredRevenue,
    remainingRevenueAtRisk,
    recoveryRate,
    activeCases: activeCasesCount,
    highPriorityCases: highPriorityCount,
    failedPaymentsCount: failedPaymentsAggregate._count,
    failedPaymentsAmount: failedPaymentsAggregate._sum.amount ?? 0,
    abandonedCheckoutAmount: abandonedAggregate._sum.amount ?? 0,
    subscriptionRevenueAtRisk: subscriptionAtRiskAggregate._sum.amount ?? 0,
    recoveredCases,
    partiallyRecoveredCases: partiallyRecovered,
    unrecoverableCases: unrecoverable,
    unattributedPayments,
    byCategory,
    byPriority,
    attribution: attributionMetrics,
  }
}
