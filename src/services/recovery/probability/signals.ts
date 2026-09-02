/**
 * Collects ProbabilitySignals from database records for a given recovery case.
 * This is the bridge between DB data and the probability estimator.
 *
 * Feature 15: Now also collects feedback-adjusted priors for each action.
 */

import { db } from "@/lib/db"
import { assessCustomerValue } from "../customer-value"
import { getFeedbackAdjustedPrior } from "../feedback"
import { SUPPORTED_ACTIONS, getPriorForAction } from "./priors"
import type { ProbabilitySignals } from "./types"

/**
 * Build ProbabilitySignals for a recovery case by querying all relevant data.
 */
export async function collectSignals(
  recoveryCaseId: string
): Promise<ProbabilitySignals> {
  // 1. Load the case with relations
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { id: recoveryCaseId },
    include: {
      payment: { select: { method: true, failureCode: true, failureReason: true, customerId: true, createdAt: true } },
      recoveryAttempts: {
        orderBy: { attemptedAt: "desc" },
        select: { action: true, status: true },
      },
    },
  })

  if (!recoveryCase) throw new Error(`RecoveryCase ${recoveryCaseId} not found`)

  // 2. Case signals
  const ageMs = Date.now() - recoveryCase.detectedAt.getTime()
  const ageHours = ageMs / 3_600_000

  // 3. Customer signals
  const customerId = recoveryCase.payment?.customerId
  let customerSuccessRate = 0
  let customerSuccessfulPayments = 0
  let customerFailedPayments = 0
  let customerHistoricalSpend = 0
  let customerAvgTransactionValue = 0
  let customerLastSuccessHoursAgo: number | null = null
  let customerValueWeight = 1.0

  if (customerId) {
    const [successAgg, countAgg, lastSuccess, valueAssessment] = await Promise.all([
      db.payment.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { customerId, status: "captured" },
      }),
      db.payment.groupBy({
        by: ["status"],
        where: { customerId },
        _count: true,
      }),
      db.payment.findFirst({
        where: { customerId, status: "captured" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      assessCustomerValue(customerId, recoveryCase.merchantId).catch(() => null),
    ])

    customerHistoricalSpend = successAgg._sum.amount ?? 0
    customerSuccessfulPayments = successAgg._count
    customerAvgTransactionValue =
      customerSuccessfulPayments > 0
        ? Math.round(customerHistoricalSpend / customerSuccessfulPayments)
        : 0

    let totalPayments = 0
    for (const row of countAgg) {
      totalPayments += row._count
      if (row.status === "failed") customerFailedPayments += row._count
    }
    customerSuccessRate = totalPayments > 0 ? customerSuccessfulPayments / totalPayments : 0

    if (lastSuccess) {
      customerLastSuccessHoursAgo =
        (Date.now() - lastSuccess.createdAt.getTime()) / 3_600_000
    }

    customerValueWeight = valueAssessment?.percentile.valueWeight ?? 1.0
  }

  // 4. Payment signals
  const failureCode = recoveryCase.payment?.failureCode ?? ""
  const failureReason = recoveryCase.payment?.failureReason ?? ""
  const paymentMethod = recoveryCase.payment?.method ?? null

  // 5. Recovery history signals
  const previousAttemptActions = recoveryCase.recoveryAttempts.map((a) => a.action)

  // 6. Feature 15: Collect feedback-adjusted priors for all supported actions
  // This is done in parallel — one query per action.
  // Non-fatal: if feedback service fails, we fall back to static priors.
  let feedbackAdjustedPriors: ProbabilitySignals['feedbackAdjustedPriors'] = undefined
  try {
    const feedbackPromises = SUPPORTED_ACTIONS
      .filter((a) => a !== "no_action")
      .map(async (action) => {
        const configuredBase = getPriorForAction(action)?.base ?? 0.5
        const adjusted = await getFeedbackAdjustedPrior(
          recoveryCase.merchantId,
          action,
          configuredBase,
        )
        return [action, adjusted] as const
      })
    const results = await Promise.all(feedbackPromises)
    feedbackAdjustedPriors = Object.fromEntries(results)
  } catch {
    // Non-fatal — fall back to static priors
  }

  return {
    amountAtRisk: recoveryCase.amountAtRisk,
    category: recoveryCase.category,
    priority: recoveryCase.priority,
    ageHours,
    existingRecoveryScore: recoveryCase.recoveryProbability * 100,
    customerSuccessRate,
    customerSuccessfulPayments,
    customerFailedPayments,
    customerHistoricalSpend,
    customerAvgTransactionValue,
    customerLastSuccessHoursAgo,
    customerValueWeight,
    failureCode,
    failureReason,
    paymentMethod,
    previousAttemptCount: recoveryCase.recoveryAttempts.length,
    previousAttemptActions,
    previousAttemptSuccessCount: recoveryCase.recoveryAttempts.filter(
      (a) => a.status === "succeeded"
    ).length,
    feedbackAdjustedPriors,
  }
}
