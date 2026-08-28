/**
 * Deterministic recovery scoring engine.
 *
 * Produces a 0-100 score with explainable factors.
 * Same inputs → same output. No randomness.
 *
 * The score answers: "How likely is this revenue to be recovered?"
 */

import {
  SCORE_CUSTOMER_HISTORY_MAX,
  SCORE_FAILURE_REASON_MAX,
  SCORE_PAYMENT_METHOD_MAX,
  SCORE_RECENCY_MAX,
  SCORE_AMOUNT_MAX,
  RECENCY_VERY_RECENT_MS,
  RECENCY_RECENT_MS,
  RECENCY_MODERATE_MS,
  AMOUNT_LOW_THRESHOLD,
  AMOUNT_SWEET_SPOT_MIN,
  AMOUNT_SWEET_SPOT_MAX,
  AMOUNT_HIGH_VALUE,
} from "./constants"
import type { RecoveryScore, ScoreFactor, CustomerPaymentStats, Recoverability } from "./types"

// --- Individual factor scorers --------------------------------------------

function scoreCustomerHistory(stats: CustomerPaymentStats): ScoreFactor {
  const { successfulPayments, totalPayments, failedPayments } = stats
  const successRate = totalPayments > 0 ? successfulPayments / totalPayments : 0

  if (totalPayments === 0) {
    return { name: "Customer History", points: 0, maxPoints: SCORE_CUSTOMER_HISTORY_MAX, detail: "No payment history" }
  }

  let points = 0
  // Base: success rate
  if (successRate >= 0.8) {
    points = 25
  } else if (successRate >= 0.5) {
    points = 18
  } else if (successRate > 0) {
    points = 10
  }

  // Bonus: loyal customer (5+ successful payments)
  if (successfulPayments >= 5) {
    points += 5
  }

  // Penalty: chronic failure (4+ failed payments)
  if (failedPayments >= 4) {
    points = Math.max(0, points - 8)
  } else if (failedPayments >= 2) {
    points = Math.max(0, points - 3)
  }

  points = Math.min(points, SCORE_CUSTOMER_HISTORY_MAX)
  return {
    name: "Customer History",
    points,
    maxPoints: SCORE_CUSTOMER_HISTORY_MAX,
    detail: `${successfulPayments}/${totalPayments} successful (${Math.round(successRate * 100)}% success rate)`,
  }
}

function scoreCustomerValue(input: ScoreInput): ScoreFactor {
  const w = input.customerValueWeight ?? 1.0
  if (w === 1.0) {
    return { name: "Customer Value", points: 0, maxPoints: 8, detail: "Customer value weight is neutral (1.0x — average customer)" }
  }
  const magnitude = Math.abs(w - 1.0) * 10
  const clamped = Math.min(8, Math.round(magnitude))
  const direction = w > 1 ? "positive" : "negative"

  return {
    name: "Customer Value",
    points: direction === "positive" ? clamped : -clamped,
    maxPoints: 8,
    detail: `Customer value weight ${w.toFixed(2)}x (${direction === "positive" ? "above" : "below"} average — ${w < 0.85 ? "low" : w > 1.15 ? "high" : "normal"} value customer)`,
  }
}

function scoreFailureReason(recoverability: Recoverability): ScoreFactor {
  const pointsMap: Record<Recoverability, number> = {
    high: 22,
    medium: 14,
    low: 5,
  }
  const points = pointsMap[recoverability]
  return {
    name: "Failure Reason",
    points,
    maxPoints: SCORE_FAILURE_REASON_MAX,
    detail: `Recoverability: ${recoverability}`,
  }
}

function scorePaymentMethod(method: string | null | undefined): ScoreFactor {
  if (!method) {
    return { name: "Payment Method", points: 5, maxPoints: SCORE_PAYMENT_METHOD_MAX, detail: "No method recorded" }
  }
  const methodScores: Record<string, number> = {
    upi: 14,
    wallet: 11,
    card: 9,
    netbanking: 7,
    emi: 4,
  }
  const points = methodScores[method] ?? 5
  return {
    name: "Payment Method",
    points,
    maxPoints: SCORE_PAYMENT_METHOD_MAX,
    detail: `${method} (retry difficulty varies)`,
  }
}

function scoreRecency(createdAt: Date, now: Date = new Date()): ScoreFactor {
  const ageMs = now.getTime() - createdAt.getTime()
  let points: number
  let detail: string

  if (ageMs <= RECENCY_VERY_RECENT_MS) {
    points = 15
    detail = "Less than 7 days old"
  } else if (ageMs <= RECENCY_RECENT_MS) {
    points = 10
    detail = "Less than 30 days old"
  } else if (ageMs <= RECENCY_MODERATE_MS) {
    points = 5
    detail = "Less than 90 days old"
  } else {
    points = 0
    detail = "Over 90 days old"
  }

  return { name: "Recency", points, maxPoints: SCORE_RECENCY_MAX, detail }
}

function scoreAmount(amountPaise: number): ScoreFactor {
  let points: number
  let detail: string

  if (amountPaise <= AMOUNT_LOW_THRESHOLD) {
    points = 2
    detail = `₹${(amountPaise / 100).toFixed(0)} — very low value`
  } else if (amountPaise <= AMOUNT_SWEET_SPOT_MAX && amountPaise >= AMOUNT_SWEET_SPOT_MIN) {
    points = 12
    detail = `₹${(amountPaise / 100).toLocaleString("en-IN")} — sweet spot`
  } else if (amountPaise > AMOUNT_HIGH_VALUE) {
    points = 10
    detail = `₹${(amountPaise / 100).toLocaleString("en-IN")} — high value, worth pursuing`
  } else if (amountPaise > AMOUNT_SWEET_SPOT_MAX) {
    points = 8
    detail = `₹${(amountPaise / 100).toLocaleString("en-IN")} — above sweet spot`
  } else {
    points = 6
    detail = `₹${(amountPaise / 100).toLocaleString("en-IN")}`
  }

  return { name: "Amount", points, maxPoints: SCORE_AMOUNT_MAX, detail }
}

// --- Public API -----------------------------------------------------------

export interface ScoreInput {
  customerStats: CustomerPaymentStats
  recoverability: Recoverability
  paymentMethod?: string | null
  createdAt: Date
  amountPaise: number
  /** For subscriptions: penalize if many retries. */
  retryCount?: number
  /** Customer value weight from CLV percentile (0.7–1.4). Default 1.0. */
  customerValueWeight?: number
  now?: Date
}

/**
 * Compute a deterministic recovery score.
 *
 * Returns 0-100 with explainable factors.
 * Same inputs always produce the same output.
 */
export function computeRecoveryScore(input: ScoreInput): RecoveryScore {
  const factors: ScoreFactor[] = [
    scoreCustomerHistory(input.customerStats),
    scoreFailureReason(input.recoverability),
    scorePaymentMethod(input.paymentMethod),
    scoreRecency(input.createdAt, input.now),
    scoreAmount(input.amountPaise),
    scoreCustomerValue(input),
  ]

  let totalPoints = factors.reduce((sum, f) => sum + f.points, 0)

  // Subscription retry penalty
  if (input.retryCount !== undefined && input.retryCount > 0) {
    const penalty = Math.min(input.retryCount * 4, 15)
    totalPoints = Math.max(0, totalPoints - penalty)
    factors.push({
      name: "Retry Penalty",
      points: -penalty,
      maxPoints: 0,
      detail: `${input.retryCount} previous retry attempt(s)`,
    })
  }

  // Clamp to 0-100
  totalPoints = Math.min(100, Math.max(0, totalPoints))

  // Apply customer value weight as a multiplicative modifier
  if (input.customerValueWeight !== undefined && input.customerValueWeight !== 1.0) {
    const weighted = Math.round(totalPoints * input.customerValueWeight)
    const clamped = Math.min(100, Math.max(0, weighted))
    if (Math.abs(clamped - totalPoints) >= 1) {
      factors.push({
        name: "Customer Value",
        points: clamped - totalPoints,
        maxPoints: 8,
        detail: `Customer value weight ${input.customerValueWeight.toFixed(2)}x adjusted score by ${clamped - totalPoints > 0 ? "+" : "-"}${Math.abs(clamped - totalPoints)} points`,
      })
      totalPoints = clamped
    }
  }

  // Confidence: higher when we have more data signals
  const hasHistory = input.customerStats.totalPayments > 0
  const hasMethod = !!input.paymentMethod
  const hasFailureInfo = input.recoverability !== "medium"
  const signalCount = [hasHistory, hasMethod, hasFailureInfo].filter(Boolean).length
  const confidence = signalCount === 3 ? 0.9 : signalCount === 2 ? 0.7 : 0.5

  return { score: totalPoints, confidence, factors }
}
