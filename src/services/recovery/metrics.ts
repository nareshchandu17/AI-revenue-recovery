/**
 * Revenue recovery metrics aggregation.
 *
 * All numbers calculated from actual database records.
 * No hardcoded values.
 */

import { db } from "@/lib/db"
import { OPEN_CASE_STATUSES } from "./detection/constants"

export interface RecoveryMetrics {
  /** Total revenue processed (sum of all captured payments). */
  totalRevenueProcessed: number
  /** Total revenue currently at risk (open cases). */
  totalRevenueAtRisk: number
  /** Total revenue successfully recovered (completed cases). */
  totalRecoveredRevenue: number
  /** Number of active (open) recovery cases. */
  activeCases: number
  /** Number of high/critical priority open cases. */
  highPriorityCases: number
  /** Total failed payments count. */
  failedPaymentsCount: number
  /** Total failed payments amount. */
  failedPaymentsAmount: number
  /** Abandoned checkout amount eligible for recovery. */
  abandonedCheckoutAmount: number
  /** Subscription revenue at risk (past_due subs). */
  subscriptionRevenueAtRisk: number
  /** Recovery rate: recovered / (recovered + at_risk) as 0-1. */
  recoveryRate: number
  /** Breakdown by category. */
  byCategory: Record<string, { count: number; amountAtRisk: number; recovered: number }>
  /** Breakdown by priority (open cases only). */
  byPriority: Record<string, number>
}

/**
 * Compute all recovery metrics from actual DB records.
 */
export async function getRecoveryMetrics(): Promise<RecoveryMetrics> {
  // Parallel aggregates
  const [
    capturedSum,
    openCasesAggregate,
    completedAggregate,
    activeCasesCount,
    highPriorityCount,
    failedPaymentsAggregate,
    abandonedAggregate,
    subscriptionAtRiskAggregate,
    categoryBreakdown,
    priorityBreakdown,
  ] = await Promise.all([
    // Total revenue processed
    db.payment.aggregate({
      _sum: { amount: true },
      where: { status: "captured" },
    }),
    // Revenue at risk (open cases)
    db.recoveryCase.aggregate({
      _sum: { amountAtRisk: true },
      where: { status: { in: [...OPEN_CASE_STATUSES] } },
    }),
    // Recovered revenue (completed cases)
    db.recoveryCase.aggregate({
      _sum: { recoveredAmount: true },
      where: { status: "completed" },
    }),
    // Active cases count
    db.recoveryCase.count({
      where: { status: { in: [...OPEN_CASE_STATUSES] } },
    }),
    // High priority cases
    db.recoveryCase.count({
      where: {
        status: { in: [...OPEN_CASE_STATUSES] },
        priority: { in: ["high", "critical"] },
      },
    }),
    // Failed payments
    db.payment.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { status: "failed" },
    }),
    // Abandoned checkouts
    db.checkout.aggregate({
      _sum: { amount: true },
      where: { status: "abandoned" },
    }),
    // Subscription revenue at risk
    db.subscription.aggregate({
      _sum: { amount: true },
      where: { status: "past_due" },
    }),
    // Category breakdown (all non-terminal cases)
    db.recoveryCase.groupBy({
      by: ["category"],
      where: { status: { in: [...OPEN_CASE_STATUSES] } },
      _sum: { amountAtRisk: true, recoveredAmount: true },
      _count: true,
    }),
    // Priority breakdown (open cases)
    db.recoveryCase.groupBy({
      by: ["priority"],
      where: { status: { in: [...OPEN_CASE_STATUSES] } },
      _count: true,
    }),
  ])

  const totalRevenueProcessed = capturedSum._sum.amount ?? 0
  const totalRevenueAtRisk = openCasesAggregate._sum.amountAtRisk ?? 0
  const totalRecoveredRevenue = completedAggregate._sum.recoveredAmount ?? 0

  const recoveryDenominator = totalRecoveredRevenue + totalRevenueAtRisk
  const recoveryRate = recoveryDenominator > 0
    ? totalRecoveredRevenue / recoveryDenominator
    : 0

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
    totalRevenueAtRisk,
    totalRecoveredRevenue,
    activeCases: activeCasesCount,
    highPriorityCases: highPriorityCount,
    failedPaymentsCount: failedPaymentsAggregate._count,
    failedPaymentsAmount: failedPaymentsAggregate._sum.amount ?? 0,
    abandonedCheckoutAmount: abandonedAggregate._sum.amount ?? 0,
    subscriptionRevenueAtRisk: subscriptionAtRiskAggregate._sum.amount ?? 0,
    recoveryRate,
    byCategory,
    byPriority,
  }
}
