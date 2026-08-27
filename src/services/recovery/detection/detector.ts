/**
 * Revenue-at-Risk Detection Engine.
 *
 * Scans the database for eligible revenue-at-risk signals
 * and creates RecoveryCases with deterministic scores.
 *
 * This is the single entry-point for the detection pipeline.
 * It can be called from: API route, cron job, or webhook.
 *
 * Idempotent: running twice produces the same result.
 */

import { db } from "@/lib/db"
import { classifyFailure } from "./classifier"
import { checkEligibility } from "./eligibility"
import { computeRecoveryScore } from "./scoring"
import { computePriority } from "./priority"
import { createRecoveryCase } from "../case-service"
import { logAudit } from "@/services/audit/log"
import { OPEN_CASE_STATUSES } from "./constants"
import type { DetectionResult, RiskCandidate, CustomerPaymentStats } from "./types"
import type { RiskCategory } from "@prisma/client"

// --- Customer stats helper -----------------------------------------------

async function getCustomerStats(customerId: string): Promise<CustomerPaymentStats> {
  const [total, successful, failed, lastPayment] = await Promise.all([
    db.payment.count({ where: { customerId } }),
    db.payment.count({ where: { customerId, status: "captured" } }),
    db.payment.count({ where: { customerId, status: "failed" } }),
    db.payment.findFirst({
      where: { customerId, status: "captured" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ])
  return {
    totalPayments: total,
    successfulPayments: successful,
    failedPayments: failed,
    successRate: total > 0 ? successful / total : 0,
    lastPaymentDate: lastPayment?.createdAt ?? null,
  }
}

// --- Open case check helpers ---------------------------------------------

async function hasOpenPaymentCase(paymentId: string): Promise<boolean> {
  const existing = await db.recoveryCase.findUnique({
    where: { paymentId },
    select: { status: true },
  })
  return !!existing && (OPEN_CASE_STATUSES as readonly string[]).includes(existing.status)
}

async function hasOpenCheckoutCase(checkoutId: string): Promise<boolean> {
  const count = await db.recoveryCase.count({
    where: {
      checkoutId,
      status: { in: [...OPEN_CASE_STATUSES] },
    },
  })
  return count > 0
}

async function hasOpenSubscriptionCase(subscriptionId: string): Promise<boolean> {
  const count = await db.recoveryCase.count({
    where: {
      subscriptionId,
      status: { in: [...OPEN_CASE_STATUSES] },
    },
  })
  return count > 0
}

// --- Source scanners ------------------------------------------------------

async function scanFailedPayments(result: DetectionResult, now: Date) {
  const payments = await db.payment.findMany({
    where: {
      status: { in: ["failed", "cancelled"] },
      amount: { gt: 0 },
    },
    include: { customer: true },
  })

  for (const payment of payments) {
    result.processed++

    const hasOpen = await hasOpenPaymentCase(payment.id)
    const eligible = checkEligibility("payment", {
      status: payment.status,
      amountPaise: payment.amount,
      hasOpenCase: hasOpen,
    })

    if (!eligible.eligible) {
      result.skippedIneligible++
      continue
    }

    const classification = classifyFailure(
      payment.failureCode,
      payment.failureReason,
      "payment"
    )

    const customerStats = await getCustomerStats(payment.customerId)
    const score = computeRecoveryScore({
      customerStats,
      recoverability: classification.recoverability,
      paymentMethod: payment.method,
      createdAt: payment.createdAt,
      amountPaise: payment.amount,
      now,
      customerValueWeight,
    })
    const priority = computePriority(score.score, payment.amount)

    const category = mapToRiskCategory(payment.status, "payment")

    const { created } = await createRecoveryCase({
      merchantId: payment.merchantId,
      customerId: payment.customerId,
      source: "payment",
      sourceId: payment.id,
      amountAtRisk: payment.amount,
      currency: payment.currency,
      category,
      priority,
      score,
      failureReason: classification.reason,
      detectedAt: payment.createdAt,
    })

    if (created) {
      result.newCases++
      result.totalRevenueAtRisk += payment.amount
      if (priority === "high" || priority === "critical") {
        result.highPriorityCases++
      }
    } else {
      result.skippedExisting++
    }
  }
}

async function scanAbandonedCheckouts(result: DetectionResult, now: Date) {
  const checkouts = await db.checkout.findMany({
    where: {
      status: "abandoned",
      amount: { gt: 0 },
    },
    include: { customer: true },
  })

  for (const checkout of checkouts) {
    result.processed++

    const hasOpen = await hasOpenCheckoutCase(checkout.id)
    const eligible = checkEligibility("checkout", {
      status: checkout.status,
      amountPaise: checkout.amount,
      abandonedAt: checkout.abandonedAt,
      hasOpenCase: hasOpen,
      now,
    })

    if (!eligible.eligible) {
      result.skippedIneligible++
      continue
    }

    const classification = classifyFailure("", "", "checkout")
    const customerStats = await getCustomerStats(checkout.customerId)
    const score = computeRecoveryScore({
      customerStats,
      recoverability: classification.recoverability,
      createdAt: checkout.abandonedAt ?? checkout.createdAt,
      amountPaise: checkout.amount,
      now,
    })
    const priority = computePriority(score.score, checkout.amount)

    const { created } = await createRecoveryCase({
      merchantId: checkout.merchantId,
      customerId: checkout.customerId,
      source: "checkout",
      sourceId: checkout.id,
      amountAtRisk: checkout.amount,
      currency: checkout.currency,
      category: "checkout_abandoned",
      priority,
      score,
      failureReason: classification.reason,
      detectedAt: checkout.abandonedAt ?? checkout.createdAt,
    })

    if (created) {
      result.newCases++
      result.totalRevenueAtRisk += checkout.amount
      if (priority === "high" || priority === "critical") {
        result.highPriorityCases++
      }
    } else {
      result.skippedExisting++
    }
  }
}

async function scanPastDueSubscriptions(result: DetectionResult, now: Date) {
  const subscriptions = await db.subscription.findMany({
    where: {
      status: "past_due",
    },
    include: { customer: true },
  })

  for (const sub of subscriptions) {
    result.processed++

    const hasOpen = await hasOpenSubscriptionCase(sub.id)
    const eligible = checkEligibility("subscription", {
      status: sub.status,
      retryCount: sub.retryCount,
      hasOpenCase: hasOpen,
    })

    if (!eligible.eligible) {
      result.skippedIneligible++
      continue
    }

    const classification = classifyFailure("", "", "subscription")
    const customerStats = await getCustomerStats(sub.customerId)
    const score = computeRecoveryScore({
      customerStats,
      recoverability: classification.recoverability,
      createdAt: sub.currentPeriodStart,
      amountPaise: sub.amount,
      retryCount: sub.retryCount,
      now,
    })
    const priority = computePriority(score.score, sub.amount)

    const { created } = await createRecoveryCase({
      merchantId: sub.merchantId,
      customerId: sub.customerId,
      source: "subscription",
      sourceId: sub.id,
      amountAtRisk: sub.amount,
      currency: sub.currency,
      category: "subscription_lapsed",
      priority,
      score,
      failureReason: classification.reason,
      detectedAt: sub.currentPeriodStart,
    })

    if (created) {
      result.newCases++
      result.totalRevenueAtRisk += sub.amount
      if (priority === "high" || priority === "critical") {
        result.highPriorityCases++
      }
    } else {
      result.skippedExisting++
    }
  }
}

// --- RiskCategory mapper --------------------------------------------------

function mapToRiskCategory(
  entityStatus: string,
  source: "payment" | "checkout" | "subscription"
): RiskCategory {
  if (source === "checkout") return "checkout_abandoned"
  if (source === "subscription") return "subscription_lapsed"
  if (entityStatus === "cancelled") return "payment_expired"
  if (entityStatus === "refunded") return "refund_requested"
  return "payment_failed"
}

// --- Public API -----------------------------------------------------------

/**
 * Run the full detection scan.
 *
 * Scans failed payments, abandoned checkouts, and past-due subscriptions.
 * Creates RecoveryCases for eligible records.
 * Returns a summary of what was processed.
 */
export async function runDetection(now: Date = new Date()): Promise<DetectionResult> {
  const result: DetectionResult = {
    processed: 0,
    newCases: 0,
    updatedCases: 0,
    skippedExisting: 0,
    skippedIneligible: 0,
    totalRevenueAtRisk: 0,
    highPriorityCases: 0,
    errors: [],
  }

  try {
    await scanFailedPayments(result, now)
  } catch (err) {
    result.errors.push(`payment_scan: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    await scanAbandonedCheckouts(result, now)
  } catch (err) {
    result.errors.push(`checkout_scan: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    await scanPastDueSubscriptions(result, now)
  } catch (err) {
    result.errors.push(`subscription_scan: ${err instanceof Error ? err.message : String(err)}`)
  }

  // System-level audit
  await logAudit({
    actor: { type: "system" },
    eventType: "detection.run_completed",
    entityType: "detection_engine",
    entityId: "detection_engine",
    action: "run",
    details: [
      `Detection scan completed`,
      `Processed: ${result.processed}`,
      `New cases: ${result.newCases}`,
      `Skipped (existing): ${result.skippedExisting}`,
      `Skipped (ineligible): ${result.skippedIneligible}`,
      `Revenue at risk: ₹${(result.totalRevenueAtRisk / 100).toLocaleString("en-IN")}`,
      `High priority: ${result.highPriorityCases}`,
    ].join(" | "),
    metadata: result,
  })

  return result
}

// --- Export scoring for external use (e.g. future AI baseline) -------------

export { computeRecoveryScore, computePriority, classifyFailure, checkEligibility }
