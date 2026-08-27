/**
 * Customer Value Service.
 *
 * Computes Historical Customer Value (HCV) and percentile-based
 * CustomerValueWeight using only database aggregates.
 *
 * CLV Definition (this application):
 *   Historical Customer Value = sum of all verified successful payments.
 *   This is NOT a predictive CLV — it uses only actual transaction history.
 *
 * Performance:
 *   - Uses Prisma aggregates (no N+1)
 *   - Percentile computed via a single batch query per merchant
 *   - Safe with 1 customer, 0 customers, or identical-spend datasets
 */

import { db } from "@/lib/db"
import { logger } from "@/lib/logger"
import type {
  CustomerValue,
  CustomerPercentileResult,
  CustomerValueAssessment,
} from "./types"
import { PERCENTILE_THRESHOLDS, VALUE_WEIGHT_RANGE } from "./constants"

const log = logger.child({ service: "customer_value" })

// --- Public API ----------------------------------------------------------

/**
 * Compute the full customer value assessment for a single customer.
 */
export async function assessCustomerValue(
  customerId: string,
  merchantId: string
): Promise<CustomerValueAssessment> {
  const value = await computeCustomerValue(customerId)
  const percentile = await computePercentile(merchantId, value.totalSuccessfulSpend)

  return { customerId, value, percentile }
}

/**
 * Compute customer value for multiple customers in a single batch.
 * More efficient than calling assessCustomerValue in a loop.
 */
export async function batchAssessCustomerValues(
  customerIds: string[],
  merchantId: string
): Promise<Map<string, CustomerValueAssessment>> {
  if (customerIds.length === 0) return new Map()

  // 1. Batch-fetch all customer values
  const values = await batchComputeCustomerValues(customerIds)

  // 2. Get the percentile distribution for this merchant (single query)
  const distribution = await getMerchantSpendDistribution(merchantId)
  const populationSize = distribution.length

  const result = new Map<string, CustomerValueAssessment>()
  for (const [customerId, value] of values) {
    const percentile = computePercentileFromDistribution(
      value.totalSuccessfulSpend,
      distribution
    )
    result.set(customerId, { customerId, value, percentile: { ...percentile, populationSize } })
  }

  return result
}

/**
 * Get the spend distribution for a merchant (all customer total spends).
 * Used for percentile computation and caching boundaries.
 */
export async function getMerchantSpendDistribution(
  merchantId: string
): Promise<number[]> {
  const rows = await db.payment.groupBy({
    by: ["customerId"],
    where: { merchantId, status: "captured" },
    _sum: { amount: true },
  })
  return rows
    .map((r) => r._sum.amount ?? 0)
    .sort((a, b) => a - b)
}

// --- Internal: Customer Value Computation --------------------------------

/**
 * Compute a single customer's value from payment aggregates.
 * Uses 2 parallel DB queries (successful + failed counts).
 */
async function computeCustomerValue(customerId: string): Promise<CustomerValue> {
  const [capturedAgg, countAgg, lastSuccess] = await Promise.all([
    // Sum of successful payments
    db.payment.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { customerId, status: "captured" },
    }),
    // Total and failed counts
    db.payment.groupBy({
      by: ["status"],
      where: { customerId },
      _count: true,
    }),
    // Last successful payment timestamp
    db.payment.findFirst({
      where: { customerId, status: "captured" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ])

  const totalSuccessfulSpend = capturedAgg._sum.amount ?? 0
  const successfulPaymentCount = capturedAgg._count
  const avgTransactionValue =
    successfulPaymentCount > 0
      ? Math.round(totalSuccessfulSpend / successfulPaymentCount)
      : 0

  // Extract counts from the groupBy result
  let totalPaymentCount = 0
  let failedPaymentCount = 0
  for (const row of countAgg) {
    totalPaymentCount += row._count
    if (row.status === "failed") failedPaymentCount += row._count
  }

  return {
    totalSuccessfulSpend,
    successfulPaymentCount,
    avgTransactionValue,
    lastSuccessfulAt: lastSuccess?.createdAt.toISOString() ?? null,
    totalPaymentCount,
    failedPaymentCount,
  }
}

/**
 * Batch version — computes values for multiple customers efficiently.
 * Uses 2 aggregate queries + 1 query per customer for last success.
 */
async function batchComputeCustomerValues(
  customerIds: string[]
): Promise<Map<string, CustomerValue>> {
  const result = new Map<string, CustomerValue>()
  if (customerIds.length === 0) return result

  const [capturedAgg, statusCounts] = await Promise.all([
    db.payment.groupBy({
      by: ["customerId"],
      where: { customerId: { in: customerIds }, status: "captured" },
      _sum: { amount: true },
      _count: true,
    }),
    db.payment.groupBy({
      by: ["customerId", "status"],
      where: { customerId: { in: customerIds } },
      _count: true,
    }),
  ])

  // Build captured spend map
  const capturedMap = new Map<string, { spend: number; count: number }>()
  for (const row of capturedAgg) {
    capturedMap.set(row.customerId, {
      spend: row._sum.amount ?? 0,
      count: row._count,
    })
  }

  // Build status count map
  const statusMap = new Map<string, Map<string, number>>() // customerId -> status -> count
  for (const row of statusCounts) {
    if (!statusMap.has(row.customerId)) statusMap.set(row.customerId, new Map())
    statusMap.get(row.customerId)!.set(row.status, row._count)
  }

  for (const customerId of customerIds) {
    const captured = capturedMap.get(customerId) ?? { spend: 0, count: 0 }
    const statuses = statusMap.get(customerId) ?? new Map()
    const totalPaymentCount = Array.from(statuses.values()).reduce((s, c) => s + c, 0)
    const failedPaymentCount = statuses.get("failed") ?? 0

    result.set(customerId, {
      totalSuccessfulSpend: captured.spend,
      successfulPaymentCount: captured.count,
      avgTransactionValue:
        captured.count > 0 ? Math.round(captured.spend / captured.count) : 0,
      lastSuccessfulAt: null, // Omitted in batch — use single-customer for this
      totalPaymentCount,
      failedPaymentCount,
    })
  }

  return result
}

// --- Internal: Percentile Computation -------------------------------------

/**
 * Compute percentile for a customer's spend within their merchant.
 * Uses the batch distribution query.
 */
async function computePercentile(
  merchantId: string,
  spend: number
): Promise<CustomerPercentileResult> {
  const distribution = await getMerchantSpendDistribution(merchantId)
  return computePercentileFromDistribution(spend, distribution)
}

/**
 * Pure function: compute percentile from a sorted distribution array.
 *
 * Edge cases:
 *   - Empty distribution → percentile 50, tier "normal", weight 1.0
 *   - Single customer → percentile 50, tier "normal", weight 1.0
 *   - All customers have identical spend → percentile 50, tier "normal", weight 1.0
 *   - Zero spend → percentile 0, tier "low", weight at floor
 */
function computePercentileFromDistribution(
  spend: number,
  sortedDistribution: number[]
): CustomerPercentileResult {
  const n = sortedDistribution.length

  // Edge case: insufficient data for meaningful percentile
  if (n === 0 || n === 1) {
    return {
      percentile: 50,
      tier: "normal",
      valueWeight: 1.0,
      populationSize: n,
    }
  }

  // Check if all values are identical
  const first = sortedDistribution[0]
  const last = sortedDistribution[n - 1]
  if (first === last) {
    return {
      percentile: 50,
      tier: "normal",
      valueWeight: 1.0,
      populationSize: n,
    }
  }

  // Percentile rank: percentage of customers with <= this spend
  // Using linear interpolation for a smoother distribution
  let rank = 0
  for (let i = 0; i < n; i++) {
    if (sortedDistribution[i] <= spend) {
      rank = i + 1
    } else {
      break
    }
  }

  // Linear interpolation between adjacent values for smoother percentiles
  let percentile: number
  if (rank === 0) {
    percentile = 0
  } else if (rank >= n) {
    percentile = 100
  } else {
    const lower = sortedDistribution[rank - 1]
    const upper = sortedDistribution[rank]
    if (upper > lower) {
      const fraction = (spend - lower) / (upper - lower)
      percentile = ((rank - 1 + fraction) / (n - 1)) * 100
    } else {
      percentile = (rank / n) * 100
    }
  }

  percentile = Math.round(Math.max(0, Math.min(100, percentile)))

  // Determine tier from configured thresholds
  let tier: CustomerPercentileResult["tier"]
  if (percentile >= PERCENTILE_THRESHOLDS.very_high) {
    tier = "very_high"
  } else if (percentile >= PERCENTILE_THRESHOLDS.high) {
    tier = "high"
  } else if (percentile >= PERCENTILE_THRESHOLDS.normal) {
    tier = "normal"
  } else {
    tier = "low"
  }

  // Map percentile to bounded weight using linear interpolation
  const { min: wMin, max: wMax } = VALUE_WEIGHT_RANGE
  const valueWeight =
    wMin + ((percentile / 100) * (wMax - wMin))

  return {
    percentile,
    tier,
    valueWeight: Math.round(valueWeight * 100) / 100, // 2 decimal places
    populationSize: n,
  }
}

// --- Re-export for use by other services --------------------------------

export { computePercentileFromDistribution }
